import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  currentUserId,
  userScopedKey,
  readUserScoped,
  writeUserScoped,
  removeUserScoped,
  removeUserScopedAll,
} from '../../src/utils/userStorage.js';
import { createMemoryStorage } from '../helpers/browser-globals.mjs';

const USER_KEY = 'project-eric_user';

const signIn = (id) => {
  globalThis.localStorage.setItem(USER_KEY, JSON.stringify({ id, email: 'a@b.c' }));
};

describe('utils/userStorage — currentUserId', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('returns "guest" when nobody is signed in', () => {
    assert.equal(currentUserId(), 'guest');
  });

  it('returns the id of the signed-in account', () => {
    signIn(42);
    assert.equal(currentUserId(), '42');
  });

  it('stringifies a numeric id', () => {
    signIn(7);
    assert.equal(currentUserId(), '7');
  });

  it('returns "guest" when the stored user has no id', () => {
    globalThis.localStorage.setItem(USER_KEY, JSON.stringify({ email: 'a@b.c' }));
    assert.equal(currentUserId(), 'guest');
  });

  it('returns "guest" when the stored user is not valid JSON', () => {
    globalThis.localStorage.setItem(USER_KEY, '{not json');
    assert.equal(currentUserId(), 'guest');
  });

  it('returns "guest" when the storage throws on read', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(currentUserId(), 'guest');
  });
});

describe('utils/userStorage — userScopedKey', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('appends the guest id when nobody is signed in', () => {
    assert.equal(userScopedKey('k'), 'k:guest');
  });

  it('appends the signed-in account id', () => {
    signIn('abc');
    assert.equal(userScopedKey('k'), 'k:abc');
  });
});

describe('utils/userStorage — readUserScoped', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('returns the fallback when nothing is stored', () => {
    assert.equal(readUserScoped('missing', 'fallback'), 'fallback');
  });

  it('returns the fallback for a null fallback', () => {
    assert.equal(readUserScoped('missing'), null);
  });

  it('reads a stored value back', () => {
    signIn(1);
    writeUserScoped('k', { a: 1 });
    assert.deepEqual(readUserScoped('k'), { a: 1 });
  });

  it('does not read another account’s value', () => {
    signIn(1);
    writeUserScoped('k', 'first');
    signIn(2);
    assert.equal(readUserScoped('k', 'other'), 'other');
  });

  it('returns the fallback when the stored value is broken JSON', () => {
    signIn(1);
    globalThis.localStorage.setItem('k:1', '{not json');
    assert.equal(readUserScoped('k', 'fallback'), 'fallback');
  });

  it('returns the fallback when the storage throws on read', () => {
    globalThis.localStorage = createMemoryStorage({ failOnGet: true });
    assert.equal(readUserScoped('k', 'fallback'), 'fallback');
  });
});

describe('utils/userStorage — writeUserScoped', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('stores a value under the scoped key', () => {
    signIn(3);
    writeUserScoped('k', { x: 1 });
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('k:3')), { x: 1 });
  });

  it('ignores a falsy value', () => {
    signIn(3);
    writeUserScoped('k', null);
    writeUserScoped('k', 0);
    writeUserScoped('k', '');
    assert.equal(globalThis.localStorage.getItem('k:3'), null);
  });

  it('does not throw when the storage refuses the write', () => {
    signIn(3);
    globalThis.localStorage = createMemoryStorage({ failOnSet: true });
    assert.doesNotThrow(() => writeUserScoped('k', { x: 1 }));
  });
});

describe('utils/userStorage — removeUserScoped', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('removes the value for the signed-in account only', () => {
    signIn(1);
    writeUserScoped('k', 'a');
    signIn(2);
    writeUserScoped('k', 'b');

    removeUserScoped('k');

    // The values are stored as JSON, so the first account's entry is
    // still there — only the second account's was removed.
    assert.equal(globalThis.localStorage.getItem('k:1'), JSON.stringify('a'));
    assert.equal(globalThis.localStorage.getItem('k:2'), null);
  });

  it('does not throw when the storage refuses the removal', () => {
    globalThis.localStorage = createMemoryStorage();
    assert.doesNotThrow(() => removeUserScoped('k'));
  });
});

describe('utils/userStorage — removeUserScopedAll', () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it('removes every listed base key', () => {
    signIn(5);
    writeUserScoped('a', 1);
    writeUserScoped('b', 2);
    writeUserScoped('c', 3);

    removeUserScopedAll(['a', 'b']);

    assert.equal(globalThis.localStorage.getItem('a:5'), null);
    assert.equal(globalThis.localStorage.getItem('b:5'), null);
    assert.equal(globalThis.localStorage.getItem('c:5'), '3');
  });

  it('does nothing when the list is empty', () => {
    signIn(5);
    writeUserScoped('a', 1);
    removeUserScopedAll();
    assert.equal(globalThis.localStorage.getItem('a:5'), '1');
  });
});
