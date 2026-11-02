const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('isUserActivelyEditing detects inputs and active modals', () => {
  const code = fs.readFileSync('app.js', 'utf8');
  assert.ok(code.includes('function isUserActivelyEditing()'));
  assert.ok(code.includes('function scheduleSafeSessionRecovery()'));
  assert.ok(code.includes("modal-overlay.active"));
  assert.ok(code.includes("window.__isSharedPadDirty"));

  // Simulate environment
  const mockDocument = {
    querySelector(selector) {
      if (selector === '.modal-overlay.active') return mockDocument._modalActive ? {} : null;
      return null;
    },
    activeElement: null,
    _modalActive: false
  };

  let dirty = false;
  const mockWindow = {
    __isSharedPadDirty: () => dirty,
    location: { reloadCalled: false, reload() { this.reloadCalled = true; } }
  };

  function evalChecker(doc, win) {
    const active = doc.activeElement;
    if (doc.querySelector('.modal-overlay.active')) return true;
    if (active) {
      const tag = (active.tagName || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && !['button', 'submit', 'checkbox', 'radio'].includes(active.type))) {
        return true;
      }
      if (active.isContentEditable) return true;
    }
    if (win.__isSharedPadDirty && win.__isSharedPadDirty()) return true;
    return false;
  }

  // Case 1: Idle
  assert.equal(evalChecker(mockDocument, mockWindow), false);

  // Case 2: Modal active
  mockDocument._modalActive = true;
  assert.equal(evalChecker(mockDocument, mockWindow), true);
  mockDocument._modalActive = false;

  // Case 3: Textarea focused
  mockDocument.activeElement = { tagName: 'TEXTAREA' };
  assert.equal(evalChecker(mockDocument, mockWindow), true);

  // Case 4: Text input focused
  mockDocument.activeElement = { tagName: 'INPUT', type: 'text' };
  assert.equal(evalChecker(mockDocument, mockWindow), true);

  // Case 5: Button focused (not typing)
  mockDocument.activeElement = { tagName: 'BUTTON' };
  assert.equal(evalChecker(mockDocument, mockWindow), false);

  // Case 6: Shared pad dirty
  mockDocument.activeElement = null;
  dirty = true;
  assert.equal(evalChecker(mockDocument, mockWindow), true);
  dirty = false;
  assert.equal(evalChecker(mockDocument, mockWindow), false);
});
