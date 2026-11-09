// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Where the Python backend listens (see backend/server.py: HOST / DEFAULT_PORT).
const SERVER_ADDR: &str = "127.0.0.1:8765";

/// Owns the spawned sidecar so it can be stopped again when the app closes.
struct SidecarState(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// True when something is already accepting connections on the server port.
fn server_already_running() -> bool {
    match SERVER_ADDR.parse::<SocketAddr>() {
        Ok(addr) => TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok(),
        Err(_) => false,
    }
}

/// Stop the sidecar. `set_process_group(true)` put it in a Windows job object,
/// so this terminates the PyInstaller bootloader parent *and* the real server
/// child that holds port 8765 - killing the parent alone is not enough.
fn stop_sidecar(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<SidecarState>() else {
        return;
    };
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    if let Some(child) = guard.take() {
        if let Err(error) = child.kill() {
            eprintln!("essay-server: failed to stop the sidecar: {error:?}");
        } else {
            eprintln!("essay-server: sidecar stopped");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // A server that is already listening (started by hand while
            // developing, or a previous instance) wins: the exe exits with
            // code 1 when the port is taken, which is not an error for us, so
            // we just keep using that server and never spawn a second one.
            if server_already_running() {
                eprintln!(
                    "essay-server: {SERVER_ADDR} is already in use, using that server"
                );
                return Ok(());
            }

            // Resolves binaries/essay-server-<target-triple>.exe, which is
            // listed under bundle.externalBin in tauri.conf.json.
            let command = match app.shell().sidecar("essay-server") {
                Ok(command) => command,
                Err(error) => {
                    eprintln!("essay-server: could not resolve the sidecar: {error:?}");
                    return Ok(());
                }
            };

            match command
                .set_process_group(true)
                .kill_on_drop(true)
                .spawn()
            {
                Ok((mut rx, child)) => {
                    // Track how the sidecar ends (including the exit code 1 the
                    // exe returns when the port is taken) without ever surfacing
                    // it to the user: a missing backend is not a crash.
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Terminated(payload) = event {
                                eprintln!("essay-server: sidecar exited: {payload:?}");
                            }
                        }
                    });

                    app.manage(SidecarState(Mutex::new(Some(child))));
                    eprintln!("essay-server: sidecar started on {SERVER_ADDR}");
                }
                Err(error) => {
                    eprintln!("essay-server: failed to start the sidecar: {error:?}");
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => stop_sidecar(app_handle),
        _ => {}
    });
}
