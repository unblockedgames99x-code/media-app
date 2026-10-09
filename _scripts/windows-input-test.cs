using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public sealed class MediaWindowsInputTest : IDisposable {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MouseInput { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] public struct KeyboardInput { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Explicit)] public struct InputData {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] public struct Input { public uint Type; public InputData Data; }
    [StructLayout(LayoutKind.Sequential)] public struct GuiThreadInfo {
        public uint Size, Flags;
        public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        public Rect CaretRect;
    }
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect bounds);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int metric);
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiThreadInfo info);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLong64(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong32(IntPtr window, int index);

    private readonly IntPtr host, child, originalForeground, originalDpi;
    private readonly uint hostPid, enginePid;
    private readonly Point originalCursor;
    private readonly HashSet<ushort> sentKeys = new HashSet<ushort>();
    private bool movedCursor;

    public MediaWindowsInputTest(long hostWindow, long childWindow, uint hostProcess, uint engineProcess) {
        if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true" ||
            Environment.GetEnvironmentVariable("RUNNER_OS") != "Windows" ||
            Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted") {
            throw new InvalidOperationException("OS input QA is restricted to isolated GitHub-hosted Windows runners.");
        }
        host = new IntPtr(hostWindow);
        child = new IntPtr(childWindow);
        hostPid = hostProcess;
        enginePid = engineProcess;
        ValidateWindows();
        if ((GetAsyncKeyState(0x10) & 0x8000) != 0 || (GetAsyncKeyState(0x11) & 0x8000) != 0 ||
            (GetAsyncKeyState(0x12) & 0x8000) != 0 || (GetAsyncKeyState(0x5B) & 0x8000) != 0 ||
            (GetAsyncKeyState(0x5C) & 0x8000) != 0) {
            throw new InvalidOperationException("The isolated QA desktop has a held modifier key.");
        }
        originalForeground = GetForegroundWindow();
        if (!GetCursorPos(out originalCursor)) throw new InvalidOperationException("The QA cursor is unavailable.");
        originalDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
    }

    private void ValidateWindows() {
        uint owner;
        if (host == child || !IsWindow(host) || !IsWindow(child) || !IsWindowVisible(host) || !IsWindowVisible(child))
            throw new InvalidOperationException("The owned host and embedded video windows must be visible.");
        GetWindowThreadProcessId(host, out owner);
        if (owner != hostPid) throw new InvalidOperationException("The host HWND belongs to another process.");
        GetWindowThreadProcessId(child, out owner);
        if (owner != enginePid || GetParent(child) != host)
            throw new InvalidOperationException("The video HWND is outside the exact owned host/engine relationship.");
    }

    private void RequireForeground() {
        ValidateWindows();
        if (GetAncestor(GetForegroundWindow(), 2) != host)
            throw new InvalidOperationException("OS input stopped because the owned host lost foreground activation.");
    }

    private static Input Key(ushort key, bool released) {
        Input input = new Input();
        input.Type = 1;
        input.Data.Keyboard.Key = key;
        input.Data.Keyboard.Flags = released ? 2U : 0U;
        return input;
    }

    private static void Inject(Input[] inputs) {
        uint inserted = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
        if (inserted != inputs.Length)
            throw new InvalidOperationException("SendInput did not insert every OS event: " + inserted + "/" + inputs.Length + ", Win32=" + Marshal.GetLastWin32Error());
    }

    private void Press(ushort key) {
        RequireForeground();
        sentKeys.Add(key);
        Inject(new Input[] { Key(key, false), Key(key, true) });
    }

    private void SelectAll() {
        RequireForeground();
        sentKeys.Add(0x11);
        sentKeys.Add(0x41);
        Inject(new Input[] { Key(0x11, false), Key(0x41, false), Key(0x41, true), Key(0x11, true) });
    }

    private void Type(string text) {
        foreach (char character in text) Press((ushort)Char.ToUpperInvariant(character));
    }

    private Dictionary<string, object> ThreadInfo(uint thread) {
        GuiThreadInfo info = new GuiThreadInfo();
        info.Size = (uint)Marshal.SizeOf(typeof(GuiThreadInfo));
        if (!GetGUIThreadInfo(thread, ref info))
            throw new InvalidOperationException("OS GUI focus inspection failed: " + Marshal.GetLastWin32Error());
        uint owner;
        GetWindowThreadProcessId(info.Focus, out owner);
        StringBuilder name = new StringBuilder(256);
        GetClassName(info.Focus, name, name.Capacity);
        return new Dictionary<string, object> {
            { "active", info.Active.ToInt64().ToString() }, { "focus", info.Focus.ToInt64().ToString() },
            { "focusPid", owner }, { "focusClass", name.ToString() }, { "focusInsideVideo", info.Focus == child || IsChild(child, info.Focus) },
            { "focusInsideHost", info.Focus == host || IsChild(host, info.Focus) }
        };
    }

    public Dictionary<string, object> Snapshot() {
        uint owner;
        IntPtr foreground = GetForegroundWindow();
        uint engineThread = GetWindowThreadProcessId(child, out owner);
        uint foregroundOwner;
        GetWindowThreadProcessId(foreground, out foregroundOwner);
        return new Dictionary<string, object> {
            { "foreground", foreground.ToInt64().ToString() }, { "foregroundPid", foregroundOwner },
            { "foregroundInsideHost", GetAncestor(foreground, 2) == host },
            { "foregroundThread", ThreadInfo(0) }, { "engineThread", ThreadInfo(engineThread) }
        };
    }

    public Dictionary<string, object> Activate() {
        ValidateWindows();
        if (GetAncestor(GetForegroundWindow(), 2) != host && !SetForegroundWindow(host))
            throw new InvalidOperationException("Windows did not activate the owned QA host.");
        RequireForeground();
        return Snapshot();
    }

    public Dictionary<string, object> Click(double horizontal, double vertical) {
        RequireForeground();
        if (Double.IsNaN(horizontal) || Double.IsNaN(vertical) || horizontal <= 0 || horizontal >= 1 || vertical <= 0 || vertical >= 1)
            throw new InvalidOperationException("The input point must be inside the owned video viewport.");
        Rect client;
        if (!GetClientRect(child, out client)) throw new InvalidOperationException("The video client bounds are unavailable.");
        Point point = new Point();
        point.X = (int)Math.Round(horizontal * (client.Right - client.Left));
        point.Y = (int)Math.Round(vertical * (client.Bottom - client.Top));
        if (!ClientToScreen(child, ref point)) throw new InvalidOperationException("The video input point is unavailable.");
        IntPtr hit = WindowFromPoint(point);
        if (hit != child && !IsChild(child, hit))
            throw new InvalidOperationException("The OS input point is covered by a window outside the owned video.");
        StringBuilder hitClass = new StringBuilder(256);
        GetClassName(hit, hitClass, hitClass.Capacity);
        long hitStyle = IntPtr.Size == 8 ? GetWindowLong64(hit, -20).ToInt64() : GetWindowLong32(hit, -20);
        Input move = new Input();
        move.Data.Mouse.X = (int)Math.Round((point.X - GetSystemMetrics(76)) * 65535.0 / Math.Max(1, GetSystemMetrics(78) - 1));
        move.Data.Mouse.Y = (int)Math.Round((point.Y - GetSystemMetrics(77)) * 65535.0 / Math.Max(1, GetSystemMetrics(79) - 1));
        move.Data.Mouse.Flags = 0x8000 | 0x4000 | 1;
        Input down = new Input(); down.Data.Mouse.Flags = 2;
        Input up = new Input(); up.Data.Mouse.Flags = 4;
        movedCursor = true;
        Inject(new Input[] { move, down, up });
        Dictionary<string, object> result = Snapshot();
        result.Add("screenX", point.X); result.Add("screenY", point.Y);
        result.Add("hitWindow", hit.ToInt64().ToString()); result.Add("hitClass", hitClass.ToString());
        result.Add("hitExtendedStyle", hitStyle.ToString("X"));
        return result;
    }

    public Dictionary<string, object> Run(string action) {
        if (action == "type-focus") Type("focus");
        else if (action == "edit-focus") { Press(0x24); Press(0x2E); Press(0x23); Press(0x08); Type("s"); }
        else if (action == "replace-media") { SelectAll(); Type("media"); }
        else if (action == "clear") { SelectAll(); Press(0x08); }
        else if (action != "snapshot") throw new InvalidOperationException("Unsupported OS input QA action.");
        return Snapshot();
    }

    public void Dispose() {
        try {
            if (GetAncestor(GetForegroundWindow(), 2) == host) {
                foreach (ushort key in sentKeys) Inject(new Input[] { Key(key, true) });
            }
        } finally {
            if (movedCursor) SetCursorPos(originalCursor.X, originalCursor.Y);
            if (originalDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(originalDpi);
            if (originalForeground != IntPtr.Zero && IsWindow(originalForeground)) SetForegroundWindow(originalForeground);
        }
    }
}
