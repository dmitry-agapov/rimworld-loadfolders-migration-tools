import { ModSetCollection } from './ModSetCollection.js';
import * as types from './types.js';

// export type MigrationIssuesRaw

export type MigrationIssues = GenericMigrationIssues<DirIssues>;

export type DirIssues = GenericDirIssues<ModSetCollection, types.ModName>;

export type MigrationIssuesRaw = GenericMigrationIssues<DirIssuesRaw>;

export type DirIssuesRaw = GenericDirIssues<string[][], string>;

type GenericMigrationIssues<DirIssuesType> = Record<string, DirIssuesType>;

interface GenericDirIssues<ModSetsType, ModNameType> {
    [DirIssueType.NO_PATCHES]?: true;
    [DirIssueType.UNIDENT_MODS_FOUND]?: ModNameType[];
    [DirIssueType.IS_COLLECTION]?: {
        modSets: ModSetsType;
        files: string[];
    }[];
}

export const enum DirIssueType {
    /**
     * Directory doesn't contain patches.
     *
     * This is mainly used to automatically skip directories that do not contain patches.
     */
    NO_PATCHES = 'NO_PATCHES',
    /**
     * Unidentified mods found.
     */
    UNIDENT_MODS_FOUND = 'UNIDENT_MODS_FOUND',
    /**
     * Directory contains files that apply patches to different sets of mods.
     */
    IS_COLLECTION = 'IS_COLLECTION',
}
