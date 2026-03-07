/// <reference types="node" />
declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string | number;
  }
}
