#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod repo;
mod server;

use std::sync::{Arc, RwLock};

pub struct AppState {
    pub root: server::SharedRoot,
    pub port: u16,
}

fn main() {
    let root: server::SharedRoot = Arc::new(RwLock::new(repo::find_repo_root()));
    let port = server::start(root.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { root, port })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::locate_repo,
            commands::pick_media,
            commands::check_files,
            commands::image_dims,
            commands::hash_files,
            commands::read_svg,
            commands::list_projects,
            commands::save_project,
            commands::load_project,
            commands::export_page,
            commands::read_shell,
            commands::check_shell_freshness,
            commands::adopt_shell_region,
        ])
        .run(tauri::generate_context!())
        .expect("error while running page builder");
}
