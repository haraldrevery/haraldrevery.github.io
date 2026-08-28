#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod repo;
mod server;

use std::sync::{Arc, RwLock};

pub struct AppState {
    pub root: server::SharedRoot,
    pub port: u16,
    /// Rendered page for /__pb/preview. In memory only — previewing must never
    /// touch the repo.
    pub preview: server::SharedPreview,
}

fn main() {
    let root: server::SharedRoot = Arc::new(RwLock::new(repo::find_repo_root()));
    let preview: server::SharedPreview = Arc::new(RwLock::new(None));
    let port = server::start(root.clone(), preview.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { root, port, preview })
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
            commands::set_preview_html,
            commands::read_shell,
            commands::write_recovery,
            commands::read_recovery,
            commands::clear_recovery,
            commands::check_shell_freshness,
            commands::adopt_shell_region,
        ])
        .run(tauri::generate_context!())
        .expect("error while running page builder");
}
