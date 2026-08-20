import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, TokenType, MustacheType, createLocationTracker } from '../src/parser/tokenizer.js';

test('Location tracker calculates accurate 1-indexed line and column', () => {
  const source = 'line1\nline2\r\nline3';
  const getLoc = createLocationTracker(source);

  assert.deepEqual(getLoc(0), { line: 1, column: 1 }); // 'l'
  assert.deepEqual(getLoc(5), { line: 1, column: 6 }); // '\n'
  assert.deepEqual(getLoc(6), { line: 2, column: 1 }); // 'l' in line2
  assert.deepEqual(getLoc(11), { line: 2, column: 6 }); // '\r'
  assert.deepEqual(getLoc(13), { line: 3, column: 1 }); // 'l' in line3
});

test('Tokenizes basic HTML5 elements and DOCTYPE', () => {
  const source = '<!DOCTYPE html>\n<!-- banner comment -->\n<div class="container" id=\'main\'>\n  <p>Hello World</p>\n</div>';
  const tokens = tokenize(source);

  assert.ok(tokens.length > 0);

  // DOCTYPE
  const doctype = tokens.find(t => t.type === TokenType.DOCTYPE);
  assert.ok(doctype);
  assert.equal(doctype.raw, '<!DOCTYPE html>');
  assert.equal(source.slice(doctype.startOffset, doctype.endOffset), '<!DOCTYPE html>');

  // COMMENT
  const comment = tokens.find(t => t.type === TokenType.COMMENT);
  assert.ok(comment);
  assert.equal(comment.value, ' banner comment ');
  assert.equal(source.slice(comment.startOffset, comment.endOffset), '<!-- banner comment -->');

  // Open Tag <div ...>
  const divOpen = tokens.find(t => t.type === TokenType.TAG_OPEN && t.tagName === 'div');
  assert.ok(divOpen);
  assert.equal(divOpen.attributes.length, 2);
  assert.equal(divOpen.attributes[0].name, 'class');
  assert.equal(divOpen.attributes[0].value, 'container');
  assert.equal(divOpen.attributes[0].quote, '"');
  assert.equal(divOpen.attributes[1].name, 'id');
  assert.equal(divOpen.attributes[1].value, 'main');
  assert.equal(divOpen.attributes[1].quote, "'");

  // Close Tag </div>
  const divClose = tokens.find(t => t.type === TokenType.TAG_CLOSE && t.tagName === 'div');
  assert.ok(divClose);
  assert.equal(divClose.raw, '</div>');
});

test('Tokenizes void and self-closing tags with boolean and unquoted attributes', () => {
  const source = '<input type="text" required disabled data-id=123 />';
  const tokens = tokenize(source);

  assert.equal(tokens.length, 1);
  const tag = tokens[0];
  assert.equal(tag.type, TokenType.TAG_OPEN);
  assert.equal(tag.tagName, 'input');
  assert.equal(tag.selfClosing, true);
  assert.equal(tag.isVoid, true);
  assert.equal(tag.attributes.length, 4);

  assert.equal(tag.attributes[0].name, 'type');
  assert.equal(tag.attributes[0].value, 'text');
  assert.equal(tag.attributes[0].quote, '"');

  assert.equal(tag.attributes[1].name, 'required');
  assert.equal(tag.attributes[1].value, '');
  assert.equal(tag.attributes[1].quote, null);

  assert.equal(tag.attributes[2].name, 'disabled');
  assert.equal(tag.attributes[2].value, '');
  assert.equal(tag.attributes[2].quote, null);

  assert.equal(tag.attributes[3].name, 'data-id');
  assert.equal(tag.attributes[3].value, '123');
  assert.equal(tag.attributes[3].quote, null);
});

test('Tokenizes Mustache / Handlebars tags losslessly', () => {
  const source = '{{#if user}}<h1>Welcome {{user.name}}!</h1>{{{unescapedHtml}}}{{^}}Guest{{/if}}{{>footer}}';
  const tokens = tokenize(source);

  const blockStart = tokens.find(t => t.type === TokenType.MUSTACHE && t.subType === MustacheType.BLOCK_START);
  assert.ok(blockStart);
  assert.equal(blockStart.expression, 'if user');
  assert.equal(blockStart.raw, '{{#if user}}');

  const interp = tokens.find(t => t.type === TokenType.MUSTACHE && t.subType === MustacheType.INTERPOLATION);
  assert.ok(interp);
  assert.equal(interp.expression, 'user.name');
  assert.equal(interp.raw, '{{user.name}}');

  const unescaped = tokens.find(t => t.type === TokenType.MUSTACHE && t.subType === MustacheType.UNESCAPED);
  assert.ok(unescaped);
  assert.equal(unescaped.expression, 'unescapedHtml');
  assert.equal(unescaped.raw, '{{{unescapedHtml}}}');

  const partial = tokens.find(t => t.type === TokenType.MUSTACHE && t.subType === MustacheType.PARTIAL);
  assert.ok(partial);
  assert.equal(partial.expression, 'footer');
  assert.equal(partial.raw, '{{>footer}}');
});

test('Tokenizes Mustache embedded inside element opening tags and attributes', () => {
  const source = '<button {{#if isDisabled}}disabled{{/if}} class="btn {{buttonVariant}}">Click</button>';
  const tokens = tokenize(source);

  const buttonOpen = tokens.find(t => t.type === TokenType.TAG_OPEN && t.tagName === 'button');
  assert.ok(buttonOpen);
  assert.equal(buttonOpen.attributes.length, 4);

  // 1: {{#if isDisabled}}
  assert.equal(buttonOpen.attributes[0].isMustache, true);
  assert.equal(buttonOpen.attributes[0].raw, '{{#if isDisabled}}');

  // 2: disabled
  assert.equal(buttonOpen.attributes[1].name, 'disabled');

  // 3: {{/if}}
  assert.equal(buttonOpen.attributes[2].isMustache, true);
  assert.equal(buttonOpen.attributes[2].raw, '{{/if}}');

  // 4: class="btn {{buttonVariant}}"
  assert.equal(buttonOpen.attributes[3].name, 'class');
  assert.equal(buttonOpen.attributes[3].value, 'btn {{buttonVariant}}');
});

test('Tokenizes <script> and <style> raw text without parsing inner tags', () => {
  const source = '<script type="text/javascript">\n  const x = "<div class=\'fake\'>Inside Script</div>";\n</script>';
  const tokens = tokenize(source);

  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].type, TokenType.TAG_OPEN);
  assert.equal(tokens[0].tagName, 'script');

  assert.equal(tokens[1].type, TokenType.RAW_TEXT);
  assert.ok(tokens[1].value.includes('Inside Script'));

  assert.equal(tokens[2].type, TokenType.TAG_CLOSE);
  assert.equal(tokens[2].tagName, 'script');
});
