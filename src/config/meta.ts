/** The one place the game's title lives, so it can be renamed. */
export const GAME_TITLE = 'RIGHOP';

declare const __APP_VERSION__: string;
/** Version from package.json, put in at build time. */
export const GAME_VERSION: string = __APP_VERSION__;
