/**
 * Ambient module declarations for @fix11y/core inside @fix11y/agent.
 * Enables strong typing without introducing devDependencies or modifications to packages/core.
 */

declare module '@fix11y/core' {
  export function parse(source: string): any;
  export function tokenize(source: string): any[];
  export function walk(
    cst: any,
    visitor: { enter?: (node: any) => void; leave?: (node: any) => void }
  ): void;
  export function findNodes(cst: any, predicate: (node: any) => boolean): any[];
  export function getElementsByTagName(cst: any, tagName: string): any[];
  export function getAttribute(node: any, attrName: string): any;
  export function hasAttribute(node: any, attrName: string): boolean;
  export function getAttributeValue(node: any, attrName: string): string | null;
  export function getTextContent(node: any): string;

  export interface Patch {
    startOffset: number;
    endOffset: number;
    replacement: string;
    description?: string;
  }

  export function applyPatches(source: string, patches: Patch[]): string;
  export function createInsertAttributePatch(
    node: any,
    attrName: string,
    attrValue?: string | null,
    quote?: string,
    description?: string
  ): Patch;
  export function createUpdateAttributePatch(
    node: any,
    attrName: string,
    newValue: string,
    quote?: string | null,
    description?: string
  ): Patch;
  export function createRemoveAttributePatch(
    node: any,
    attrName: string,
    description?: string
  ): Patch;
  export function createSwapTagNamePatch(
    node: any,
    newTagName: string,
    description?: string
  ): Patch[];
  export function createWrapNodePatch(
    node: any,
    beforeMarkup: string,
    afterMarkup: string,
    description?: string
  ): Patch[];

  export interface Diagnostic {
    ruleId: string;
    message: string;
    severity: string;
    safety: string;
    node: any;
    startOffset: number;
    endOffset: number;
    loc?: any;
    patches?: Patch[];
  }

  export function evaluateRules(cst: any, options?: any): Diagnostic[];
  export function remediate(source: string, options?: any): {
    source: string;
    patched: string;
    diagnostics: Diagnostic[];
    patches: Patch[];
  };

  export function createUnifiedDiff(
    oldStr: string,
    newStr: string,
    options?: {
      fromFile?: string;
      toFile?: string;
      context?: number;
      color?: boolean;
    }
  ): string;

  export function myersDiff(aLines: string[], bLines: string[]): any[];
  export function splitLines(str: string): string[];
}
