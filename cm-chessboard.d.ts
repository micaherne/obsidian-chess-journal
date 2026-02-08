declare module "cm-chessboard" {
	export interface ChessboardConfig {
		position?: string;
		assetsUrl?: string;
		assetsCache?: boolean;
		orientation?: string;
		style?: {
			cssClass?: string;
			showCoordinates?: boolean;
			pieces?: {
				file?: string;
			};
			animationDuration?: number;
		};
	}

	export class Chessboard {
		constructor(element: HTMLElement, config?: ChessboardConfig);
		setPosition(fen: string, animated?: boolean): Promise<void>;
		getPosition(): string;
		destroy(): void;
	}

	export const COLOR: {
		white: string;
		black: string;
	};

	export const FEN: {
		start: string;
		empty: string;
	};
}
