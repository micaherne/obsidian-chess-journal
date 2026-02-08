import "obsidian";

declare module "obsidian" {
	interface WorkspaceLeaf {
		/** Re-reads the view's getDisplayText() and getIcon() to update the tab header. */
		updateHeader(): void;
	}
}
