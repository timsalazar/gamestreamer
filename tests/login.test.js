import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const loginHtmlPath = path.join(process.cwd(), 'public', 'login.html');

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(name) {
    this.classes.add(name);
  }

  remove(name) {
    this.classes.delete(name);
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.classList = new FakeClassList();
  }
}

function extractInlineLoginScript(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const inlineScripts = scripts
    .map((match) => match[1])
    .filter((content) => content.trim());

  const script = inlineScripts.find((content) => content.includes('async function handleLogin'));
  assert.ok(script, 'Expected to find login inline script');
  return script;
}

async function loadLoginHarness({ signInImpl }) {
  const html = await fs.readFile(loginHtmlPath, 'utf8');
  const script = extractInlineLoginScript(html);

  const elements = {
    email: new FakeElement(),
    password: new FakeElement(),
    'error-msg': new FakeElement(),
    'submit-btn': new FakeElement(),
  };
  elements['submit-btn'].textContent = 'Sign In';

  const signInCalls = [];
  const locationState = { href: '/login.html' };

  const context = {
    console,
    document: {
      getElementById(id) {
        const element = elements[id];
        assert.ok(element, `Unknown element requested: ${id}`);
        return element;
      },
    },
    window: {
      supabase: {
        createClient() {
          return {
            auth: {
              signInWithPassword: async (credentials) => {
                signInCalls.push(credentials);
                return signInImpl(credentials);
              },
            },
          };
        },
      },
      location: locationState,
    },
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(script, context, { filename: 'public/login.html' });

  return {
    elements,
    signInCalls,
    locationState,
    handleLogin: context.handleLogin,
  };
}

describe('login page', () => {
  test('shows validation error when email or password is missing', async () => {
    const harness = await loadLoginHarness({
      signInImpl: async () => ({ data: null, error: null }),
    });

    await harness.handleLogin({ preventDefault() {} });

    assert.equal(harness.signInCalls.length, 0);
    assert.equal(harness.elements['error-msg'].textContent, 'Please enter your email and password.');
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), true);
    assert.equal(harness.elements['submit-btn'].disabled, false);
    assert.equal(harness.locationState.href, '/login.html');
  });

  test('shows Supabase error and resets loading state on failed sign-in', async () => {
    const harness = await loadLoginHarness({
      signInImpl: async () => ({
        data: null,
        error: { message: 'Invalid login credentials' },
      }),
    });

    harness.elements.email.value = 'player@example.com';
    harness.elements.password.value = 'wrong-password';

    await harness.handleLogin({ preventDefault() {} });

    assert.equal(harness.signInCalls.length, 1);
    assert.equal(harness.signInCalls[0].email, 'player@example.com');
    assert.equal(harness.signInCalls[0].password, 'wrong-password');
    assert.equal(harness.elements['error-msg'].textContent, 'Invalid login credentials');
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), true);
    assert.equal(harness.elements['submit-btn'].disabled, false);
    assert.equal(harness.elements['submit-btn'].textContent, 'Sign In');
    assert.equal(harness.locationState.href, '/login.html');
  });

  test('shows fallback error and resets loading state on unexpected exception', async () => {
    const harness = await loadLoginHarness({
      signInImpl: async () => {
        throw new Error('network down');
      },
    });

    harness.elements.email.value = 'player@example.com';
    harness.elements.password.value = 'secret';

    await harness.handleLogin({ preventDefault() {} });

    assert.equal(
      harness.elements['error-msg'].textContent,
      'An unexpected error occurred. Please try again.'
    );
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), true);
    assert.equal(harness.elements['submit-btn'].disabled, false);
    assert.equal(harness.elements['submit-btn'].textContent, 'Sign In');
    assert.equal(harness.locationState.href, '/login.html');
  });

  test('redirects to the home page after successful sign-in', async () => {
    const harness = await loadLoginHarness({
      signInImpl: async () => ({
        data: { session: { access_token: 'token' } },
        error: null,
      }),
    });

    harness.elements.email.value = '  player@example.com ';
    harness.elements.password.value = 'secret';

    await harness.handleLogin({ preventDefault() {} });

    assert.equal(harness.signInCalls.length, 1);
    assert.equal(harness.signInCalls[0].email, 'player@example.com');
    assert.equal(harness.signInCalls[0].password, 'secret');
    assert.equal(harness.locationState.href, '/index.html');
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), false);
    assert.equal(harness.elements['submit-btn'].disabled, true);
    assert.match(harness.elements['submit-btn'].innerHTML, /Signing in/);
  });
});
