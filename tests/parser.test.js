import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  walk,
  findNodes,
  getElementsByTagName,
  getAttribute,
  hasAttribute,
  getAttributeValue,
  getTextContent
} from '../src/parser/parser.js';

test('Parses template partials without injecting synthetic html/body elements', () => {
  const source = '<div class="card">\n  <h2>{{title}}</h2>\n  <p>Some content</p>\n</div>';
  const cst = parse(source);

  assert.equal(cst.type, 'root');
  assert.equal(cst.children.length, 1);
  assert.equal(cst.children[0].type, 'element');
  assert.equal(cst.children[0].tagName, 'div');
});

test('Correctly manages void elements without nesting children inside them', () => {
  const source = '<form>\n  <img src="photo.jpg" alt="A photo">\n  <input type="text" name="user">\n  <button type="submit">Submit</button>\n</form>';
  const cst = parse(source);

  const form = cst.children[0];
  assert.equal(form.tagName, 'form');

  const elements = form.children.filter(c => c.type === 'element');
  assert.equal(elements.length, 3);
  assert.equal(elements[0].tagName, 'img');
  assert.equal(elements[0].isVoid, true);
  assert.equal(elements[0].children.length, 0);

  assert.equal(elements[1].tagName, 'input');
  assert.equal(elements[1].isVoid, true);
  assert.equal(elements[1].children.length, 0);

  assert.equal(elements[2].tagName, 'button');
  assert.equal(elements[2].isVoid, false);
  assert.equal(elements[2].children.length, 1);
});

test('Preserves Mustache template block nodes and inline expressions in tree', () => {
  const source = '<ul>\n  {{#each items}}\n    <li>{{this.name}}</li>\n  {{/each}}\n</ul>';
  const cst = parse(source);

  const ul = cst.children[0];
  assert.equal(ul.tagName, 'ul');

  const mustaches = findNodes(cst, n => n.type === 'mustache');
  assert.equal(mustaches.length, 3);
  assert.equal(mustaches[0].expression, 'each items');
  assert.equal(mustaches[1].expression, 'this.name');
  assert.equal(mustaches[2].expression, 'each');
});

test('Attribute query helpers work accurately', () => {
  const source = '<input type="email" id="user-email" disabled aria-required="true" />';
  const cst = parse(source);
  const input = cst.children[0];

  assert.ok(hasAttribute(input, 'type'));
  assert.ok(hasAttribute(input, 'ID')); // Case-insensitive
  assert.ok(hasAttribute(input, 'disabled'));
  assert.ok(hasAttribute(input, 'aria-required'));
  assert.equal(hasAttribute(input, 'nonexistent'), false);

  assert.equal(getAttributeValue(input, 'type'), 'email');
  assert.equal(getAttributeValue(input, 'id'), 'user-email');
  assert.equal(getAttributeValue(input, 'disabled'), '');
  assert.equal(getAttributeValue(input, 'aria-required'), 'true');
  assert.equal(getAttributeValue(input, 'nonexistent'), null);

  const idAttr = getAttribute(input, 'id');
  assert.equal(idAttr.name, 'id');
  assert.equal(idAttr.value, 'user-email');
  assert.equal(idAttr.quote, '"');
});

test('getElementsByTagName and getTextContent utilities', () => {
  const source = '<main>\n  <section><h1>Page Title</h1></section>\n  <section><p>Paragraph 1</p><p>Paragraph 2</p></section>\n</main>';
  const cst = parse(source);

  const sections = getElementsByTagName(cst, 'section');
  assert.equal(sections.length, 2);

  const paragraphs = getElementsByTagName(cst, 'p');
  assert.equal(paragraphs.length, 2);
  assert.equal(getTextContent(paragraphs[0]), 'Paragraph 1');
  assert.equal(getTextContent(paragraphs[1]), 'Paragraph 2');

  const allElements = getElementsByTagName(cst, '*');
  assert.equal(allElements.length, 6); // main, section, h1, section, p, p
});

test('Handles unclosed tags gracefully without crashing', () => {
  const source = '<div><p>Unclosed paragraph<div>Next div</div>';
  const cst = parse(source);

  assert.equal(cst.type, 'root');
  assert.ok(cst.children.length > 0);
  const divs = getElementsByTagName(cst, 'div');
  assert.ok(divs.length >= 1);
});
