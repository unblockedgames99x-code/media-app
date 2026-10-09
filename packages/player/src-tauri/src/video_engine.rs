use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(25);
const STATUS_FAILURE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug, Deserialize, specta::Type)]
pub struct VideoBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, specta::Type)]
pub struct PhysicalBounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

impl VideoBounds {
    fn physical(
        self,
        scale: f64,
        client_width: u32,
        client_height: u32,
    ) -> Result<PhysicalBounds, String> {
        if ![self.x, self.y, self.width, self.height, scale]
            .iter()
            .all(|value| value.is_finite())
            || self.width < 1.0
            || self.height < 1.0
            || scale <= 0.0
            || scale > 16.0
            || self.width > 100_000.0
            || self.height > 100_000.0
        {
            return Err("Video area has invalid dimensions".into());
        }
        let left = (self.x * scale).round().clamp(0.0, client_width as f64) as i32;
        let top = (self.y * scale).round().clamp(0.0, client_height as f64) as i32;
        let right = ((self.x + self.width) * scale)
            .round()
            .clamp(0.0, client_width as f64) as i32;
        let bottom = ((self.y + self.height) * scale)
            .round()
            .clamp(0.0, client_height as f64) as i32;
        if right <= left || bottom <= top {
            return Err("Video area is outside the application window".into());
        }
        Ok(PhysicalBounds {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        })
    }
}

#[derive(Deserialize)]
struct Handshake {
    pid: u32,
    #[serde(default)]
    hwnd: String,
    port: u16,
}

impl Handshake {
    fn validate(&self, expected_pid: u32) -> Result<isize, String> {
        if self.pid != expected_pid || self.port == 0 {
            return Err("Video engine returned an invalid process or control port".into());
        }
        if !cfg!(windows) {
            return Ok(1);
        }
        let handle = self
            .hwnd
            .parse::<usize>()
            .map_err(|_| "Video engine returned an invalid window handle")?;
        if handle == 0 || handle > isize::MAX as usize {
            return Err("Video engine returned an invalid window handle".into());
        }
        Ok(handle as isize)
    }
}

#[derive(Serialize, specta::Type)]
pub struct VideoEngineStatus {
    ready: bool,
    pid: Option<u32>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VideoEngineInspection {
    ready: bool,
    pid: Option<u32>,
    hwnd: Option<String>,
    parent_hwnd: Option<String>,
    visible: bool,
    desired_visible: bool,
    bounds: Option<PhysicalBounds>,
    requested_bounds: Option<PhysicalBounds>,
    engine_path: Option<String>,
    fullscreen: bool,
}

struct NativeInspection {
    parent: isize,
    visible: bool,
    bounds: PhysicalBounds,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct FullscreenSession {
    active: bool,
    previous: Option<bool>,
}

impl FullscreenSession {
    fn transition(&mut self, requested: bool, parent_fullscreen: bool) -> Option<bool> {
        if self.active == requested {
            return None;
        }
        self.active = requested;
        if requested {
            self.previous = Some(parent_fullscreen);
            Some(true)
        } else {
            Some(self.previous.take().unwrap_or(false))
        }
    }
}

#[derive(Deserialize)]
struct PlaybackStatus {
    pid: u32,
    fullscreen: bool,
    #[serde(default, rename = "workspaceReturnRevision")]
    workspace_return_revision: u64,
    #[serde(flatten)]
    navigation: VideoNavigation,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
struct HiddenNavigation {
    trending: bool,
    popular: bool,
    playlists: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoNavigation {
    #[serde(default = "default_video_path")]
    path: String,
    #[serde(default)]
    hidden_navigation: HiddenNavigation,
}

fn default_video_path() -> String {
    "/home".to_owned()
}

#[derive(Default)]
struct StatusHealth {
    failed_since: Option<Instant>,
}

impl StatusHealth {
    fn failed(&mut self, now: Instant) -> bool {
        now.duration_since(*self.failed_since.get_or_insert(now)) >= STATUS_FAILURE_TIMEOUT
    }

    fn reset(&mut self) {
        self.failed_since = None;
    }
}

#[derive(Default)]
struct NativeFullscreen {
    session: FullscreenSession,
    token: Option<String>,
}

struct Engine {
    child: Child,
    executable: PathBuf,
    handshake_path: PathBuf,
    token: String,
    port: Option<u16>,
    hwnd: Option<isize>,
    parent: isize,
    bounds: PhysicalBounds,
    visible: bool,
    synchronized_visibility: Option<bool>,
    started: Instant,
    revision: u64,
    monitor_started: bool,
    workspace_return_revision: u64,
    fullscreen: bool,
}

impl Engine {
    fn request_shutdown(&mut self) {
        if let Some(port) = self.port {
            let address = SocketAddr::from(([127, 0, 0, 1], port));
            if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200))
            {
                let _ = stream.set_write_timeout(Some(Duration::from_millis(200)));
                let request = format!("POST /shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}", self.token);
                let _ = stream.write_all(request.as_bytes());
                let deadline = Instant::now() + Duration::from_millis(750);
                while Instant::now() < deadline && matches!(self.child.try_wait(), Ok(None)) {
                    std::thread::sleep(Duration::from_millis(25));
                }
            }
        }
        self.stop();
    }

    fn stop(&mut self) {
        if let Some(hwnd) = self.hwnd {
            native::hide(hwnd, self.child.id());
        }
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        let _ = std::fs::remove_file(&self.handshake_path);
    }
}

#[derive(Default)]
pub struct VideoEngineState(Mutex<Option<Engine>>, Mutex<NativeFullscreen>);

impl Drop for VideoEngineState {
    fn drop(&mut self) {
        if let Ok(slot) = self.0.get_mut() {
            if let Some(engine) = slot.as_mut() {
                engine.stop();
            }
        }
    }
}

fn engine_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("engines/cartertube/build");
    engine_candidates(resource, workspace)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            "The video engine is missing. Reinstall the app or build its video engine.".into()
        })
}

fn engine_candidates(resource: PathBuf, workspace: PathBuf) -> Vec<PathBuf> {
    let resources = resource.join("video-engine");
    if cfg!(windows) {
        [
            resources.join("media-video.exe"),
            resources.join("CarterMedia Video.exe"),
            workspace.join("win-unpacked/media-video.exe"),
            workspace.join("win-unpacked/CarterMedia Video.exe"),
        ]
        .into()
    } else if cfg!(target_os = "macos") {
        [
            resources.join("Media Video.app/Contents/MacOS/media-video"),
            resources.join("Media Video.app/Contents/MacOS/Media Video"),
            resources.join("CarterMedia Video.app/Contents/MacOS/CarterMedia Video"),
            workspace.join("mac/Media Video.app/Contents/MacOS/media-video"),
            workspace.join("mac-arm64/Media Video.app/Contents/MacOS/media-video"),
        ]
        .into()
    } else {
        [
            resources.join("media-video"),
            resources.join("cartermedia-video"),
            workspace.join("linux-unpacked/media-video"),
            workspace.join("linux-arm64-unpacked/media-video"),
        ]
        .into()
    }
}

fn start_engine(
    app: &AppHandle,
    parent: isize,
    bounds: PhysicalBounds,
    visible: bool,
) -> Result<Engine, String> {
    let executable = engine_path(app)?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("video-engine");
    let user_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("video");
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&user_data).map_err(|error| error.to_string())?;
    let token = uuid::Uuid::new_v4().to_string();
    let handshake_path = cache.join(format!("handshake-{}.json", uuid::Uuid::new_v4()));
    let mut command = Command::new(&executable);
    command
        .env("CARTERMEDIA_EMBEDDED", "1")
        .env("CARTERMEDIA_HANDSHAKE_FILE", &handshake_path)
        .env("CARTERMEDIA_CONTROL_TOKEN", &token)
        .env("CARTERMEDIA_PARENT_PID", std::process::id().to_string())
        .env_remove("ELECTRON_RUN_AS_NODE")
        .arg(format!("--user-data-dir={}", user_data.display()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "linux")]
    if let Some(directory) = std::env::var_os("APPDIR").map(PathBuf::from) {
        if std::env::current_exe().is_ok_and(|executable| executable.starts_with(&directory)) {
            command.env_remove("APPDIR").env_remove("APPIMAGE");
            if let Some(library_path) = std::env::var_os("LD_LIBRARY_PATH") {
                let retained = std::env::split_paths(&library_path)
                    .filter(|path| !path.starts_with(&directory))
                    .collect::<Vec<_>>();
                if retained.is_empty() {
                    command.env_remove("LD_LIBRARY_PATH");
                } else if let Ok(library_path) = std::env::join_paths(retained) {
                    command.env("LD_LIBRARY_PATH", library_path);
                }
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start the video engine: {error}"))?;
    Ok(Engine {
        child,
        executable,
        handshake_path,
        token,
        port: None,
        hwnd: None,
        parent,
        bounds,
        visible,
        synchronized_visibility: None,
        started: Instant::now(),
        revision: 1,
        monitor_started: false,
        workspace_return_revision: 0,
        fullscreen: false,
    })
}

#[cfg(windows)]
fn update_fullscreen(app: &AppHandle, token: &str, revision: Option<u64>, requested: bool) {
    let dispatcher = app.clone();
    let app_handle = app.clone();
    let token = token.to_owned();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = dispatcher.run_on_main_thread(move || {
            let Some(window) = app_handle.get_webview_window("main") else {
                return;
            };
            let state = app_handle.state::<VideoEngineState>();
            {
                let Ok(slot) = state.inner().0.lock() else {
                    return;
                };
                if requested
                    && !slot.as_ref().is_some_and(|engine| {
                        engine.token == token && engine.visible && revision == Some(engine.revision)
                    })
                {
                    return;
                }
                if !requested
                    && slot.as_ref().is_some_and(|engine| {
                        engine.token == token
                            && revision.is_some_and(|revision| revision != engine.revision)
                    })
                {
                    return;
                }
            }
            let Ok(mut fullscreen) = state.inner().1.lock() else {
                return;
            };
            if !requested && fullscreen.token.as_deref() != Some(&token) {
                return;
            }
            if fullscreen.session.active == requested {
                return;
            }
            let Ok(parent_fullscreen) = window.is_fullscreen() else {
                return;
            };
            let previous = fullscreen.session;
            if let Some(target) = fullscreen.session.transition(requested, parent_fullscreen) {
                if let Err(error) = window.set_fullscreen(target) {
                    fullscreen.session = previous;
                    log::warn!("Could not synchronize video fullscreen: {error}");
                    return;
                }
                fullscreen.token = requested.then_some(token);
                if let Err(error) = app_handle.emit("video-engine-fullscreen", requested) {
                    log::warn!("Could not update the fullscreen layout: {error}");
                }
            }
        }) {
            log::warn!("Could not dispatch video fullscreen to the main window: {error}");
        }
    });
}

#[cfg(not(windows))]
fn update_fullscreen(_app: &AppHandle, _token: &str, _revision: Option<u64>, _requested: bool) {}

#[cfg(any(not(windows), test))]
fn show_music_window(app: &AppHandle, notify: bool) {
    restore_music_window(app, notify, None);
}

#[cfg(any(not(windows), test))]
fn restore_music_window(app: &AppHandle, notify: bool, expected: Option<(String, u64)>) {
    let dispatcher = app.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = dispatcher.run_on_main_thread(move || {
            let state = app_handle.state::<VideoEngineState>();
            let Ok(slot) = state.inner().0.lock() else {
                return;
            };
            if slot.as_ref().is_some_and(|engine| engine.visible)
                || expected.as_ref().is_some_and(|(token, revision)| {
                    !slot.as_ref().is_some_and(|engine| {
                        engine.token == *token && engine.revision == *revision && !engine.visible
                    })
                })
            {
                return;
            }
            drop(slot);
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
                if notify {
                    let _ = app_handle.emit("video-engine-return-to-music", ());
                }
            }
        }) {
            log::warn!("Could not restore the music window: {error}");
        }
    });
}

#[cfg(any(not(windows), test))]
fn hide_music_window(app: &AppHandle, token: &str, revision: u64) {
    let dispatcher = app.clone();
    let app_handle = app.clone();
    let token = token.to_owned();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = dispatcher.run_on_main_thread(move || {
            let state = app_handle.state::<VideoEngineState>();
            let Ok(slot) = state.inner().0.lock() else {
                return;
            };
            if slot.as_ref().is_some_and(|engine| {
                engine.token == token && engine.revision == revision && engine.visible
            }) {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
        }) {
            log::warn!("Could not hand off the video workspace: {error}");
        }
    });
}

fn stop_slot(app: &AppHandle, slot: &mut Option<Engine>) {
    if let Some(mut engine) = slot.take() {
        let was_ready = engine.hwnd.is_some();
        update_fullscreen(app, &engine.token, None, false);
        engine.stop();
        #[cfg(not(windows))]
        show_music_window(app, false);
        if was_ready {
            let _ = app.emit(
                "video-engine-unavailable",
                "The video engine stopped responding. Retry to continue.",
            );
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn video_engine_attach(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, VideoEngineState>,
    bounds: VideoBounds,
    visible: bool,
) -> Result<VideoEngineStatus, String> {
    if window.label() != "main" {
        return Err("The video engine belongs to the main application window".into());
    }
    let parent = native::parent_handle(&window)?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let bounds = bounds.physical(
        window.scale_factor().map_err(|error| error.to_string())?,
        size.width,
        size.height,
    )?;
    {
        let mut slot = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Video engine state is unavailable")?;
        if let Some(engine) = slot.as_mut() {
            if engine
                .child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_some()
            {
                stop_slot(&app, &mut slot);
            }
        }
        if slot.is_none() {
            *slot = Some(start_engine(&app, parent, bounds, visible)?);
        }
        let engine = slot.as_mut().unwrap();
        if engine.parent != parent {
            return Err("The video engine is attached to another window".into());
        }
        engine.bounds = bounds;
        if engine.visible != visible {
            engine.synchronized_visibility = None;
        }
        engine.visible = visible;
        engine.revision += 1;
    }

    loop {
        let ready = {
            let mut slot = state
                .inner()
                .0
                .lock()
                .map_err(|_| "Video engine state is unavailable")?;
            let engine = slot.as_mut().ok_or("Video engine startup was cancelled")?;
            if let Some(exit) = engine.child.try_wait().map_err(|error| error.to_string())? {
                let message = format!("The video engine exited before it was ready ({exit})");
                stop_slot(&app, &mut slot);
                return Err(message);
            }
            if engine.hwnd.is_none() && engine.handshake_path.is_file() {
                let result = std::fs::read(&engine.handshake_path)
                    .map_err(|error| error.to_string())
                    .and_then(|contents| {
                        if contents.len() > 4096 {
                            return Err("Video engine handshake is too large".into());
                        }
                        serde_json::from_slice::<Handshake>(&contents)
                            .map_err(|error| format!("Invalid video engine handshake: {error}"))
                    })
                    .and_then(|handshake| {
                        let hwnd = handshake.validate(engine.child.id())?;
                        native::attach(hwnd, engine.parent, engine.child.id())?;
                        engine.hwnd = Some(hwnd);
                        engine.port = Some(handshake.port);
                        Ok(())
                    });
                if let Err(error) = result {
                    stop_slot(&app, &mut slot);
                    return Err(error);
                }
                let _ = std::fs::remove_file(&engine.handshake_path);
            }
            if let Some(hwnd) = engine.hwnd {
                if let Err(error) = native::position(
                    hwnd,
                    engine.parent,
                    engine.child.id(),
                    engine.bounds,
                    engine.visible,
                ) {
                    stop_slot(&app, &mut slot);
                    return Err(error);
                }
                let start_monitor = !engine.monitor_started;
                engine.monitor_started = true;
                Some((
                    engine.child.id(),
                    engine.port.unwrap(),
                    engine.token.clone(),
                    engine.visible,
                    engine.revision,
                    start_monitor,
                    engine.synchronized_visibility != Some(engine.visible),
                ))
            } else if engine.started.elapsed() >= STARTUP_TIMEOUT {
                stop_slot(&app, &mut slot);
                return Err(
                    "The video engine did not become ready within 25 seconds. Please retry.".into(),
                );
            } else {
                None
            }
        };
        if let Some((pid, port, token, visible, revision, start_monitor, sync_visibility)) = ready {
            if sync_visibility {
                synchronize_visibility(&app, state.inner(), port, &token, revision, visible)
                    .await?;
            }
            if start_monitor {
                monitor_engine(app.clone(), token.clone());
            }
            return Ok(VideoEngineStatus {
                ready: true,
                pid: Some(pid),
            });
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn control(
    port: u16,
    token: &str,
    endpoint: &str,
    body: serde_json::Value,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(format!("http://127.0.0.1:{port}/{endpoint}"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Video control request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Video control returned {}", response.status()));
    }
    Ok(())
}

async fn playback_status(
    client: &reqwest::Client,
    port: u16,
    token: &str,
) -> Result<PlaybackStatus, String> {
    client
        .get(format!("http://127.0.0.1:{port}/status"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Video status request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Video status returned an error: {error}"))?
        .json::<PlaybackStatus>()
        .await
        .map_err(|error| format!("Video status is invalid: {error}"))
}

#[cfg(any(not(windows), test))]
fn workspace_return_is_current(
    request: u64,
    handled: u64,
    expected_revision: u64,
    revision: u64,
    visible: bool,
) -> bool {
    visible && request > handled && expected_revision == revision
}

#[cfg(any(not(windows), test))]
async fn return_to_music(
    app: &AppHandle,
    token: &str,
    expected_revision: u64,
    request: u64,
) -> bool {
    let connection = {
        let state = app.state::<VideoEngineState>();
        let Ok(mut slot) = state.inner().0.lock() else {
            return false;
        };
        let Some(engine) = slot.as_mut().filter(|engine| {
            engine.token == token
                && workspace_return_is_current(
                    request,
                    engine.workspace_return_revision,
                    expected_revision,
                    engine.revision,
                    engine.visible,
                )
        }) else {
            return false;
        };
        engine.workspace_return_revision = request;
        engine.visible = false;
        engine.revision += 1;
        engine.synchronized_visibility = None;
        engine.port.map(|port| (port, engine.revision))
    };
    if let Some((port, revision)) = connection {
        let state = app.state::<VideoEngineState>();
        let _ = synchronize_visibility(app, state.inner(), port, token, revision, false).await;
        restore_music_window(app, true, Some((token.to_owned(), revision)));
        true
    } else {
        false
    }
}

fn monitor_engine(app: AppHandle, token: String) {
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                log::warn!("Could not monitor video fullscreen: {error}");
                return;
            }
        };
        let mut health = StatusHealth::default();
        let mut last_navigation = None;
        loop {
            tokio::time::sleep(Duration::from_millis(250)).await;
            let connection = {
                let state = app.state::<VideoEngineState>();
                let Ok(mut slot) = state.inner().0.lock() else {
                    return;
                };
                let Some(engine) = slot.as_mut().filter(|engine| engine.token == token) else {
                    return;
                };
                match engine.child.try_wait() {
                    Ok(None) => {}
                    Ok(Some(_)) | Err(_) => {
                        stop_slot(&app, &mut slot);
                        return;
                    }
                }
                if engine.visible {
                    engine
                        .port
                        .map(|port| (port, engine.revision, engine.child.id()))
                } else {
                    None
                }
            };
            let Some((port, revision, pid)) = connection else {
                health.reset();
                continue;
            };
            let status = match playback_status(&client, port, &token).await {
                Ok(status) if status.pid == pid => {
                    health.reset();
                    status
                }
                _ => {
                    if health.failed(Instant::now()) {
                        let state = app.state::<VideoEngineState>();
                        if let Ok(mut slot) = state.inner().0.lock() {
                            if slot.as_ref().is_some_and(|engine| {
                                engine.token == token
                                    && engine.visible
                                    && engine.revision == revision
                            }) {
                                stop_slot(&app, &mut slot);
                                return;
                            }
                        }
                        health.reset();
                    }
                    continue;
                }
            };
            #[cfg(not(windows))]
            if return_to_music(&app, &token, revision, status.workspace_return_revision).await {
                continue;
            }
            let state = app.state::<VideoEngineState>();
            let Ok(mut slot) = state.inner().0.lock() else {
                return;
            };
            let Some(engine) = slot.as_mut().filter(|engine| {
                engine.token == token
                    && engine.visible
                    && engine.revision == revision
                    && engine.child.id() == status.pid
            }) else {
                continue;
            };
            engine.fullscreen = status.fullscreen;
            engine.workspace_return_revision = status.workspace_return_revision;
            update_fullscreen(
                &app,
                &engine.token,
                Some(engine.revision),
                status.fullscreen,
            );
            let navigation = (revision, status.navigation);
            if last_navigation.as_ref() != Some(&navigation) {
                if let Err(error) = app.emit("video-engine-navigation", &navigation.1) {
                    log::warn!("Could not synchronize video navigation: {error}");
                } else {
                    last_navigation = Some(navigation);
                }
            }
        }
    });
}

async fn synchronize_visibility(
    app: &AppHandle,
    state: &VideoEngineState,
    port: u16,
    token: &str,
    revision: u64,
    visible: bool,
) -> Result<(), String> {
    let response = control(
        port,
        token,
        "visibility",
        serde_json::json!({ "visible": visible, "revision": revision }),
    )
    .await;
    let mut slot = state
        .0
        .lock()
        .map_err(|_| "Video engine state is unavailable")?;
    let Some(engine) = slot
        .as_mut()
        .filter(|engine| engine.token == token && engine.revision == revision)
    else {
        return Ok(());
    };
    if let Err(error) = response {
        stop_slot(app, &mut slot);
        if visible {
            return Err(format!("Could not show the video engine: {error}"));
        }
        log::warn!("Hidden video engine could not pause and was stopped: {error}");
    } else {
        if let Err(error) = native::position(
            engine.hwnd.ok_or("The video window is unavailable")?,
            engine.parent,
            engine.child.id(),
            engine.bounds,
            engine.visible,
        ) {
            stop_slot(app, &mut slot);
            return Err(error);
        }
        engine.synchronized_visibility = Some(visible);
        #[cfg(not(windows))]
        if visible {
            hide_music_window(app, token, revision);
        } else {
            restore_music_window(app, false, Some((token.to_owned(), revision)));
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn video_engine_hide(
    app: AppHandle,
    state: State<'_, VideoEngineState>,
) -> Result<(), String> {
    let connection = {
        let mut slot = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Video engine state is unavailable")?;
        slot.as_mut().map(|engine| {
            if engine.visible {
                engine.synchronized_visibility = None;
            }
            engine.visible = false;
            engine.revision += 1;
            if let Some(hwnd) = engine.hwnd {
                native::hide(hwnd, engine.child.id());
            }
            update_fullscreen(&app, &engine.token, Some(engine.revision), false);
            (engine.port, engine.token.clone(), engine.revision)
        })
    };
    app.emit("video-engine-fullscreen", false)
        .map_err(|error| error.to_string())?;
    if let Some((Some(port), token, revision)) = connection {
        synchronize_visibility(&app, state.inner(), port, &token, revision, false).await?;
    }
    #[cfg(not(windows))]
    show_music_window(&app, false);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn video_engine_theme(
    state: State<'_, VideoEngineState>,
    variables: HashMap<String, String>,
) -> Result<(), String> {
    if variables.len() > 128
        || variables.iter().any(|(name, value)| {
            !name.starts_with("--")
                || name.len() > 128
                || !name.chars().all(|character| {
                    character.is_ascii_alphanumeric() || character == '-' || character == '_'
                })
                || value.len() > 1024
                || value.contains(['{', '}', ';'])
        })
    {
        return Err("Video theme contains invalid CSS variables".into());
    }
    let connection = {
        let slot = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Video engine state is unavailable")?;
        slot.as_ref()
            .and_then(|engine| engine.port.map(|port| (port, engine.token.clone())))
    };
    if let Some((port, token)) = connection {
        control(
            port,
            &token,
            "theme",
            serde_json::json!({ "variables": variables }),
        )
        .await?;
    }
    Ok(())
}

fn validate_appearance(appearance: &HashMap<String, String>) -> Result<(), String> {
    if appearance.len() > 8 {
        return Err("Appearance has too many settings".into());
    }
    for (name, value) in appearance {
        let valid = match name.as_str() {
            "displayName" => value.chars().count() <= 40 && !value.chars().any(char::is_control),
            "logoDataUrl" | "backgroundImage" => {
                value.is_empty()
                    || (value.len() <= 2_800_000
                        && [
                            "data:image/png;base64,",
                            "data:image/jpeg;base64,",
                            "data:image/webp;base64,",
                        ]
                        .iter()
                        .find_map(|prefix| value.strip_prefix(*prefix))
                        .is_some_and(|payload| {
                            !payload.is_empty()
                                && base64::Engine::decode(
                                    &base64::engine::general_purpose::STANDARD,
                                    payload,
                                )
                                .is_ok()
                        }))
            }
            "backgroundStyle" => ["solid", "gradient", "image"].contains(&value.as_str()),
            "gradientEnd" => {
                value.len() == 7
                    && value.starts_with('#')
                    && value[1..]
                        .chars()
                        .all(|character| character.is_ascii_hexdigit())
            }
            "gradientAngle" | "imageOpacity" | "blur" => {
                let maximum = match name.as_str() {
                    "gradientAngle" => 360.0,
                    "imageOpacity" => 60.0,
                    _ => 24.0,
                };
                value
                    .trim()
                    .parse::<f64>()
                    .is_ok_and(|number| number.is_finite() && number >= 0.0 && number <= maximum)
            }
            _ => false,
        };
        if !valid {
            return Err("Appearance contains an invalid setting".into());
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn video_engine_appearance(
    state: State<'_, VideoEngineState>,
    appearance: HashMap<String, String>,
) -> Result<(), String> {
    validate_appearance(&appearance)?;
    let connection = {
        let slot = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Video engine state is unavailable")?;
        slot.as_ref()
            .and_then(|engine| engine.port.map(|port| (port, engine.token.clone())))
    };
    if let Some((port, token)) = connection {
        control(
            port,
            &token,
            "appearance",
            serde_json::json!({ "appearance": appearance }),
        )
        .await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn video_engine_navigate(
    state: State<'_, VideoEngineState>,
    path: String,
) -> Result<(), String> {
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.len() > 2048
        || path.contains(['\r', '\n', '\0'])
    {
        return Err("Invalid video navigation path".into());
    }
    let connection = {
        let slot = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Video engine state is unavailable")?;
        slot.as_ref()
            .and_then(|engine| engine.port.map(|port| (port, engine.token.clone())))
    };
    let (port, token) =
        connection.ok_or("The video engine is not ready. Open Videos and try again.")?;
    control(
        port,
        &token,
        "navigate",
        serde_json::json!({ "path": path }),
    )
    .await
}

pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<VideoEngineState>() {
        if let Ok(mut slot) = state.inner().0.lock() {
            if let Some(mut engine) = slot.take() {
                update_fullscreen(app, &engine.token, None, false);
                engine.request_shutdown();
            }
        }
    }
}

pub fn restore_main_workspace(app: &AppHandle) {
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    #[cfg(not(windows))]
    restore_portable_main_workspace(app);
}

#[cfg(any(not(windows), test))]
fn restore_portable_main_workspace(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<VideoEngineState>();
        let video_active = state
            .inner()
            .0
            .lock()
            .is_ok_and(|slot| slot.as_ref().is_some_and(|engine| engine.visible));
        if video_active {
            let _ = video_engine_hide(app.clone(), state).await;
        }
        show_music_window(&app, video_active);
    });
}

#[tauri::command]
#[specta::specta]
pub fn video_engine_status(
    app: AppHandle,
    state: State<'_, VideoEngineState>,
) -> Result<VideoEngineInspection, String> {
    let mut slot = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Video engine state is unavailable")?;
    if let Some(engine) = slot.as_mut() {
        if engine
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            stop_slot(&app, &mut slot);
        }
    }
    if let Some(engine) = slot.as_ref() {
        let inspection = engine
            .hwnd
            .and_then(|hwnd| native::inspect(hwnd, engine.parent, engine.child.id()));
        return Ok(VideoEngineInspection {
            ready: if cfg!(windows) {
                inspection
                    .as_ref()
                    .is_some_and(|details| details.parent == engine.parent)
            } else {
                engine.port.is_some()
            },
            pid: Some(engine.child.id()),
            hwnd: if cfg!(windows) {
                engine.hwnd.map(|hwnd| hwnd.to_string())
            } else {
                None
            },
            parent_hwnd: inspection
                .as_ref()
                .map(|details| details.parent.to_string()),
            visible: if cfg!(windows) {
                inspection.as_ref().is_some_and(|details| details.visible)
            } else {
                engine.visible && engine.synchronized_visibility == Some(true)
            },
            desired_visible: engine.visible,
            bounds: inspection.as_ref().map(|details| details.bounds),
            requested_bounds: Some(engine.bounds),
            engine_path: Some(engine.executable.display().to_string()),
            fullscreen: if cfg!(windows) {
                state
                    .inner()
                    .1
                    .lock()
                    .is_ok_and(|fullscreen| fullscreen.session.active)
            } else {
                engine.fullscreen
            },
        });
    }
    Ok(VideoEngineInspection {
        ready: false,
        pid: None,
        hwnd: None,
        parent_hwnd: None,
        visible: false,
        desired_visible: false,
        bounds: None,
        requested_bounds: None,
        engine_path: None,
        fullscreen: false,
    })
}

#[cfg(windows)]
mod native {
    use super::{NativeInspection, PhysicalBounds};
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::{GetLastError, SetLastError, HWND, RECT};
    use windows_sys::Win32::UI::HiDpi::{
        AreDpiAwarenessContextsEqual, GetWindowDpiAwarenessContext,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    pub fn parent_handle(window: &WebviewWindow) -> Result<isize, String> {
        window
            .hwnd()
            .map(|handle| handle.0 as isize)
            .map_err(|error| error.to_string())
    }

    fn validate(hwnd: HWND, parent: HWND, pid: u32) -> Result<(), String> {
        let mut owner = 0;
        unsafe {
            if hwnd == parent || IsWindow(hwnd) == 0 || IsWindow(parent) == 0 {
                return Err("Video engine window is no longer available".into());
            }
            GetWindowThreadProcessId(hwnd, &mut owner);
        }
        if owner != pid {
            return Err("Video engine window does not belong to its process".into());
        }
        Ok(())
    }

    pub fn attach(handle: isize, parent_handle: isize, pid: u32) -> Result<(), String> {
        let hwnd = handle as HWND;
        let parent = parent_handle as HWND;
        validate(hwnd, parent, pid)?;
        unsafe {
            ShowWindowAsync(hwnd, SW_HIDE);
            if AreDpiAwarenessContextsEqual(
                GetWindowDpiAwarenessContext(hwnd),
                GetWindowDpiAwarenessContext(parent),
            ) == 0
            {
                log::warn!("Video engine and host report different DPI awareness contexts");
            }
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let child_style = (style
                & !(WS_POPUP
                    | WS_CAPTION
                    | WS_THICKFRAME
                    | WS_SYSMENU
                    | WS_MINIMIZEBOX
                    | WS_MAXIMIZEBOX))
                | WS_CHILD
                | WS_CLIPSIBLINGS
                | WS_CLIPCHILDREN;
            SetLastError(0);
            if SetWindowLongPtrW(hwnd, GWL_STYLE, child_style as isize) == 0 && GetLastError() != 0
            {
                return Err(format!(
                    "Could not prepare video window: {}",
                    GetLastError()
                ));
            }
            let extended = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                ((extended & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW) as isize,
            );
            SetLastError(0);
            if SetParent(hwnd, parent).is_null() && GetLastError() != 0 {
                return Err(format!("Could not embed video window: {}", GetLastError()));
            }
            if GetParent(hwnd) != parent {
                return Err("The video window was not attached to the app".into());
            }
        }
        Ok(())
    }

    pub fn position(
        handle: isize,
        parent_handle: isize,
        pid: u32,
        bounds: PhysicalBounds,
        visible: bool,
    ) -> Result<(), String> {
        let hwnd = handle as HWND;
        let parent = parent_handle as HWND;
        validate(hwnd, parent, pid)?;
        unsafe {
            if GetParent(hwnd) != parent {
                return Err("The video window detached from the app".into());
            }
            if SetWindowPos(
                hwnd,
                HWND_TOP,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                SWP_NOACTIVATE
                    | SWP_ASYNCWINDOWPOS
                    | SWP_FRAMECHANGED
                    | if visible {
                        SWP_SHOWWINDOW
                    } else {
                        SWP_HIDEWINDOW
                    },
            ) == 0
            {
                return Err(format!(
                    "Could not resize embedded video window: {}",
                    GetLastError()
                ));
            }
        }
        Ok(())
    }

    pub fn hide(handle: isize, pid: u32) {
        let mut owner = 0;
        unsafe {
            GetWindowThreadProcessId(handle as HWND, &mut owner);
            if owner == pid {
                ShowWindowAsync(handle as HWND, SW_HIDE);
            }
        }
    }

    pub fn inspect(handle: isize, parent_handle: isize, pid: u32) -> Option<NativeInspection> {
        let hwnd = handle as HWND;
        if validate(hwnd, parent_handle as HWND, pid).is_err() {
            return None;
        }
        let mut bounds = RECT::default();
        unsafe {
            if GetWindowRect(hwnd, &mut bounds) == 0 {
                return None;
            }
            Some(NativeInspection {
                parent: GetParent(hwnd) as isize,
                visible: IsWindowVisible(hwnd) != 0,
                bounds: PhysicalBounds {
                    x: bounds.left,
                    y: bounds.top,
                    width: bounds.right - bounds.left,
                    height: bounds.bottom - bounds.top,
                },
            })
        }
    }
}

#[cfg(not(windows))]
mod native {
    use super::{NativeInspection, PhysicalBounds};
    use tauri::WebviewWindow;
    pub fn parent_handle(_window: &WebviewWindow) -> Result<isize, String> {
        Ok(1)
    }
    pub fn attach(_handle: isize, _parent: isize, _pid: u32) -> Result<(), String> {
        Ok(())
    }
    pub fn position(
        _handle: isize,
        _parent: isize,
        _pid: u32,
        _bounds: PhysicalBounds,
        _visible: bool,
    ) -> Result<(), String> {
        Ok(())
    }
    pub fn hide(_handle: isize, _pid: u32) {}
    pub fn inspect(_handle: isize, _parent: isize, _pid: u32) -> Option<NativeInspection> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn control_server(status: u16) -> (u16, tokio::task::JoinHandle<String>) {
        control_server_body(status, "{}").await
    }

    async fn control_server_body(
        status: u16,
        body: &'static str,
    ) -> (u16, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let request = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            loop {
                let mut chunk = [0u8; 1024];
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
                if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .map(|value| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
                assert!(bytes.len() <= 4096);
            }
            stream.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
            String::from_utf8(bytes).unwrap()
        });
        (port, request)
    }

    #[tokio::test]
    async fn control_uses_authenticated_loopback_and_forwards_theme_and_visibility_bodies() {
        for (endpoint, payload) in [
            (
                "theme",
                serde_json::json!({ "variables": { "--background": "#123456" } }),
            ),
            (
                "visibility",
                serde_json::json!({ "visible": true, "revision": 12 }),
            ),
            (
                "visibility",
                serde_json::json!({ "visible": false, "revision": 13 }),
            ),
            (
                "appearance",
                serde_json::json!({ "appearance": { "displayName": "My library", "backgroundStyle": "solid" } }),
            ),
        ] {
            let (port, request) = control_server(200).await;
            control(port, "private-token", endpoint, payload.clone())
                .await
                .unwrap();
            let request = request.await.unwrap();
            assert!(request.starts_with(&format!("POST /{endpoint} HTTP/1.1\r\n")));
            assert!(request
                .to_lowercase()
                .contains("authorization: bearer private-token\r\n"));
            let (_, body) = request.split_once("\r\n\r\n").unwrap();
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(body).unwrap(),
                payload
            );
        }
    }

    #[tokio::test]
    async fn control_reports_failed_engine_responses() {
        let (port, request) = control_server(503).await;
        assert!(
            control(port, "private-token", "pause", serde_json::json!({}))
                .await
                .unwrap_err()
                .contains("503")
        );
        request.await.unwrap();
    }

    #[tokio::test]
    async fn status_reads_fullscreen_from_authenticated_get() {
        let (port, request) =
            control_server_body(200, r#"{"pid":42,"fullscreen":true,"paused":false}"#).await;
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let status = playback_status(&client, port, "private-token")
            .await
            .unwrap();
        assert_eq!(status.pid, 42);
        assert!(status.fullscreen);
        assert_eq!(status.workspace_return_revision, 0);
        assert_eq!(status.navigation.path, "/home");
        assert_eq!(
            status.navigation.hidden_navigation,
            HiddenNavigation::default()
        );
        let request = request.await.unwrap();
        assert!(request.starts_with("GET /status HTTP/1.1\r\n"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer private-token\r\n"));
    }

    #[test]
    fn fullscreen_restores_each_original_parent_state_and_ignores_repeated_status() {
        for original in [false, true] {
            let mut session = FullscreenSession::default();
            assert_eq!(session.transition(false, original), None);
            assert_eq!(session.transition(true, original), Some(true));
            assert_eq!(session.transition(true, true), None);
            assert_eq!(session.transition(false, true), Some(original));
            assert_eq!(session, FullscreenSession::default());
            assert_eq!(session.transition(false, original), None);
        }
    }

    #[test]
    fn navigation_preserves_hidden_preferences_and_frontend_field_names() {
        let status = serde_json::from_value::<PlaybackStatus>(serde_json::json!({
            "pid": 42,
            "fullscreen": false,
            "path": "/watch/video-id?playlistId=list-id",
            "hiddenNavigation": { "trending": true, "popular": false, "playlists": true }
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(status.navigation).unwrap(),
            serde_json::json!({
                "path": "/watch/video-id?playlistId=list-id",
                "hiddenNavigation": { "trending": true, "popular": false, "playlists": true }
            })
        );
    }

    #[test]
    fn transient_status_errors_recover_and_continuous_failures_have_a_deadline() {
        let start = Instant::now();
        let mut health = StatusHealth::default();
        assert!(!health.failed(start));
        assert!(!health.failed(start + Duration::from_secs(14)));
        assert!(health.failed(start + Duration::from_secs(15)));
        health.reset();
        assert!(!health.failed(start + Duration::from_secs(30)));
        assert!(!health.failed(start + Duration::from_secs(44)));
        assert!(health.failed(start + Duration::from_secs(45)));
    }

    #[test]
    fn converts_css_bounds_to_physical_pixels_and_clips_to_host() {
        let bounds = VideoBounds {
            x: 240.0,
            y: 80.0,
            width: 1000.0,
            height: 720.0,
        };
        assert_eq!(
            bounds.physical(1.5, 1920, 1080).unwrap(),
            PhysicalBounds {
                x: 360,
                y: 120,
                width: 1500,
                height: 960
            }
        );
        let partly_hidden = VideoBounds {
            x: -20.0,
            y: -10.0,
            width: 200.0,
            height: 100.0,
        };
        assert_eq!(
            partly_hidden.physical(1.0, 1280, 720).unwrap(),
            PhysicalBounds {
                x: 0,
                y: 0,
                width: 180,
                height: 90
            }
        );
    }

    #[test]
    fn rejects_unlaid_out_or_invalid_video_areas() {
        for bounds in [
            VideoBounds {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 720.0,
            },
            VideoBounds {
                x: 0.0,
                y: f64::NAN,
                width: 100.0,
                height: 100.0,
            },
            VideoBounds {
                x: 2000.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            },
        ] {
            assert!(bounds.physical(1.0, 1280, 720).is_err());
        }
    }

    #[test]
    fn handshake_requires_exact_spawned_process_and_valid_handle_and_port() {
        assert_eq!(
            Handshake {
                pid: 42,
                hwnd: "123456".into(),
                port: 9001
            }
            .validate(42)
            .unwrap(),
            if cfg!(windows) { 123456 } else { 1 }
        );
        assert!(Handshake {
            pid: 43,
            hwnd: "123456".into(),
            port: 9001
        }
        .validate(42)
        .is_err());
        let empty_handle = Handshake {
            pid: 42,
            hwnd: "0".into(),
            port: 9001,
        }
        .validate(42);
        assert_eq!(empty_handle.is_err(), cfg!(windows));
        assert!(Handshake {
            pid: 42,
            hwnd: "123456".into(),
            port: 0
        }
        .validate(42)
        .is_err());
    }

    #[test]
    fn portable_handshake_and_workspace_return_use_authenticated_process_identity() {
        let handshake = serde_json::from_str::<Handshake>(r#"{"pid":42,"port":9001}"#).unwrap();
        assert_eq!(handshake.validate(42).is_ok(), !cfg!(windows));
        assert!(handshake.validate(99).is_err());
        let status = serde_json::from_str::<PlaybackStatus>(
            r#"{"pid":42,"fullscreen":false,"workspaceReturnRevision":3}"#,
        )
        .unwrap();
        assert_eq!(status.workspace_return_revision, 3);
    }

    #[test]
    fn stale_portable_status_cannot_hide_a_reopened_or_already_hidden_workspace() {
        assert!(workspace_return_is_current(1, 0, 4, 4, true));
        assert!(!workspace_return_is_current(1, 0, 4, 6, true));
        assert!(!workspace_return_is_current(1, 0, 4, 4, false));
        assert!(!workspace_return_is_current(1, 1, 6, 6, true));
        assert!(workspace_return_is_current(2, 1, 6, 6, true));
    }

    #[test]
    fn installed_video_runtime_is_resolved_before_workspace_builds() {
        let resource = PathBuf::from("installed");
        let workspace = PathBuf::from("workspace");
        let candidates = engine_candidates(resource.clone(), workspace.clone());
        assert!(candidates[0].starts_with(resource.join("video-engine")));
        assert!(candidates.iter().any(|path| path.starts_with(&workspace)));
        assert!(candidates[0].to_string_lossy().contains("media-video"));
    }

    #[test]
    fn appearance_accepts_raster_uploads_and_bounded_controls_without_external_resources() {
        let valid = HashMap::from([
            ("displayName".to_owned(), "My library 🎵".to_owned()),
            (
                "logoDataUrl".to_owned(),
                "data:image/png;base64,AA==".to_owned(),
            ),
            ("backgroundImage".to_owned(), String::new()),
            ("backgroundStyle".to_owned(), "gradient".to_owned()),
            ("gradientEnd".to_owned(), "#123456".to_owned()),
            ("gradientAngle".to_owned(), "180".to_owned()),
            ("imageOpacity".to_owned(), "25".to_owned()),
            ("blur".to_owned(), "4".to_owned()),
        ]);
        validate_appearance(&valid).unwrap();
        for (name, value) in [
            ("unknown", "custom"),
            ("displayName", "invalid\nname"),
            ("backgroundImage", "https://untrusted.example/photo.png"),
            ("logoDataUrl", "data:image/svg+xml;base64,AAAA"),
            ("logoDataUrl", "data:image/png;base64,A==="),
            ("gradientAngle", "361"),
            ("imageOpacity", "61"),
            ("blur", "NaN"),
            ("gradientEnd", "red;display:none"),
        ] {
            assert!(
                validate_appearance(&HashMap::from([(name.to_owned(), value.to_owned())])).is_err()
            );
        }
        assert!(
            validate_appearance(&HashMap::from([("displayName".to_owned(), "a".repeat(41))]))
                .is_err()
        );
    }
}
