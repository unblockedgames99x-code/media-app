pub fn profile_link_arguments(arguments: impl IntoIterator<Item = String>) -> Option<Vec<String>> {
    let mut arguments = arguments.into_iter();
    let executable = arguments.next()?;
    let mut has_profile = false;
    let mut remaining = Vec::new();
    while let Some(argument) = arguments.next() {
        if argument == "--profile" {
            arguments.next()?;
            has_profile = true;
        } else {
            remaining.push(argument);
        }
    }
    if has_profile && remaining.len() == 1 {
        Some(vec![executable, remaining.remove(0)])
    } else {
        None
    }
}

pub fn cli_video_link(arguments: impl IntoIterator<Item = String>) -> Option<String> {
    let arguments = arguments.into_iter().collect::<Vec<_>>();
    let arguments = profile_link_arguments(arguments.clone()).unwrap_or(arguments);
    if arguments.len() != 2 {
        return None;
    }
    let link = &arguments[1];
    let prefix = "cartermedia://watch/";
    if !link.get(..prefix.len())?.eq_ignore_ascii_case(prefix) {
        return None;
    }
    let video_id = link.get(prefix.len()..)?;
    let video_id = video_id.strip_suffix('/').unwrap_or(video_id);
    (video_id.len() == 11
        && video_id
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-')))
    .then(|| link.to_owned())
}

#[tauri::command]
#[specta::specta]
pub fn startup_video_link() -> Option<String> {
    cli_video_link(std::env::args())
}

#[cfg(test)]
mod tests {
    use super::{cli_video_link, profile_link_arguments};

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn forwards_a_video_link_with_a_named_profile() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "--profile",
                "qa-links",
                "cartermedia://watch/dQw4w9WgXcQ",
            ])),
            Some(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ]))
        );
    }

    #[test]
    fn supports_a_profile_after_the_link() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
                "--profile",
                "qa-links",
            ])),
            Some(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ]))
        );
    }

    #[test]
    fn leaves_standard_launch_arguments_to_the_plugin() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ])),
            None
        );
    }

    #[test]
    fn ignores_non_link_profile_launches() {
        assert_eq!(
            profile_link_arguments(arguments(&["CarterMedia.exe", "--profile", "qa-links"])),
            None
        );
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "--profile",
                "qa-links",
                "cartermedia://watch/dQw4w9WgXcQ",
                "extra",
            ])),
            None
        );
    }

    #[test]
    fn accepts_startup_video_links_with_or_without_a_named_profile() {
        for values in [
            vec!["Media", "cartermedia://watch/dQw4w9WgXcQ"],
            vec![
                "Media",
                "--profile",
                "qa-runtime",
                "cartermedia://watch/dQw4w9WgXcQ",
            ],
            vec![
                "Media",
                "cartermedia://watch/dQw4w9WgXcQ",
                "--profile",
                "qa-runtime",
            ],
        ] {
            assert_eq!(
                cli_video_link(arguments(&values)),
                Some("cartermedia://watch/dQw4w9WgXcQ".into())
            );
        }
        assert_eq!(
            cli_video_link(arguments(&["Media", "CarterMedia://watch/aB_cD-01234/"])),
            Some("CarterMedia://watch/aB_cD-01234/".into())
        );
    }

    #[test]
    fn rejects_non_video_or_ambiguous_startup_arguments() {
        for link in [
            "https://watch/dQw4w9WgXcQ",
            "cartermedia://watch/short",
            "cartermedia://watch/dQw4w9WgXcQ?redirect=https://example.com",
            "cartermedia://watch/dQw4w9WgXcQ//",
            "cartermedia://watch/abcdefghijé",
        ] {
            assert_eq!(cli_video_link(arguments(&["Media", link])), None);
        }
        assert_eq!(
            cli_video_link(arguments(&[
                "Media",
                "cartermedia://watch/dQw4w9WgXcQ",
                "extra"
            ])),
            None
        );
    }
}
