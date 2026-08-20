import { deepFreeze } from '@/lib/freeze';

/**
 * Модель файловой системы рабочего стола. Дерево плоское: узлы лежат в словаре,
 * а иерархию задаёт `parentId`. Так переезд папки — это правка одного поля, а не
 * перестройка вложенных массивов.
 */

export type FileKind = 'folder' | 'text';

export type FileNode = {
  id: string;
  kind: FileKind;
  name: string;
  /** `null` — узел лежит прямо на рабочем столе. */
  parentId: string | null;
  /** Содержимое текстового файла. У папки всегда пустая строка. */
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type FileTree = Record<string, FileNode>;

/**
 * Что лежит в буфере обмена и как оно туда попало. Список, а не один узел:
 * вырезать и копировать можно всё выделение сразу.
 */
export type Clipboard = { ids: string[]; mode: 'cut' | 'copy' } | null;

export type FilesState = {
  nodes: FileTree;
  clipboard: Clipboard;
};

/** Расширение текстового файла. Одно на всю систему: других типов нет. */
export const TEXT_EXTENSION = '.txt';

/**
 * Границы. Хранилище браузера общее на весь сайт, и дерево не должно съесть его
 * целиком: имя, содержимое, количество узлов и глубина ограничены явно.
 */
export const FILE_LIMITS = deepFreeze({
  nameLength: 48,
  bodyLength: 20_000,
  nodes: 200,
  depth: 8,
} as const);

export const FILES_STORAGE_KEY = 'portfolio:files';
export const FILES_VERSION = 1;
