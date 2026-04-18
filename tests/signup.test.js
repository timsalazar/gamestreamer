import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const signupHtmlPath = path.join(process.cwd(), 'public', 'signup.html');

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

function extractInlineSignupScript(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const inlineScripts = scripts
    .map((match) => match[1])
    .filter((content) => content.trim());

  const script = inlineScripts.find((content) => content.includes('async function handleSignup'));
  assert.ok(script, 'Expected to find signup inline script');
  return script;
}

async function loadSignupHarness({ signUpImpl }) {
  const html = await fs.readFile(signupHtmlPath, 'utf8');
  const script = extractInlineSignupScript(html);

  const elements = {
    name: new FakeElement(),
    email: new FakeElement(),
    password: new FakeElement(),
    'error-msg': new FakeElement(),
    'success-msg': new FakeElement(),
    'submit-btn': new FakeElement(),
  };
  elements['submit-btn'].textContent = 'Create Account';

  const signUpCalls = [];
  const locationState = { href: '/signup.html', search: '' };

  const context = {
    console,
    URLSearchParams,
    sessionStorage: {
      setItem() {},
    },
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
              signUp: async (payload) => {
                signUpCalls.push(payload);
                return signUpImpl(payload);
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
  vm.runInContext(script, context, { filename: 'public/signup.html' });

  return {
    elements,
    signUpCalls,
    locationState,
    handleSignup: context.handleSignup,
  };
}

describe('signup page', () => {
  test('shows validation error when name is missing', async () => {
    const harness = await loadSignupHarness({
      signUpImpl: async () => ({ data: null, error: null }),
    });

    harness.elements.email.value = 'coach@example.com';
    harness.elements.password.value = 'secret1';

    await harness.handleSignup({ preventDefault() {} });

    assert.equal(harness.signUpCalls.length, 0);
    assert.equal(harness.elements['error-msg'].textContent, 'Please enter your name.');
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), true);
  });

  test('shows existing-account message when Supabase returns an obfuscated duplicate user', async () => {
    const harness = await loadSignupHarness({
      signUpImpl: async () => ({
        data: {
          user: { identities: [] },
          session: null,
        },
        error: null,
      }),
    });

    harness.elements.name.value = 'Coach';
    harness.elements.email.value = 'coach@example.com';
    harness.elements.password.value = 'secret1';

    await harness.handleSignup({ preventDefault() {} });

    assert.equal(harness.signUpCalls.length, 1);
    assert.equal(
      harness.elements['error-msg'].textContent,
      'An account with this email already exists. Try signing in instead.'
    );
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), true);
    assert.equal(harness.elements['success-msg'].classList.contains('visible'), false);
    assert.equal(harness.locationState.href, '/signup.html');
  });

  test('shows confirmation guidance when signup succeeds without a session', async () => {
    const harness = await loadSignupHarness({
      signUpImpl: async () => ({
        data: {
          user: { id: 'user-1', identities: [{ id: 'identity-1' }] },
          session: null,
        },
        error: null,
      }),
    });

    harness.elements.name.value = 'Coach';
    harness.elements.email.value = 'coach@example.com';
    harness.elements.password.value = 'secret1';

    await harness.handleSignup({ preventDefault() {} });

    assert.equal(
      harness.elements['success-msg'].textContent,
      'Account created. Check your email for the confirmation link, then sign in.'
    );
    assert.equal(harness.elements['success-msg'].classList.contains('visible'), true);
    assert.equal(harness.elements['error-msg'].classList.contains('visible'), false);
    assert.equal(harness.elements['submit-btn'].disabled, false);
    assert.equal(harness.elements['submit-btn'].textContent, 'Create Account');
    assert.equal(harness.locationState.href, '/signup.html');
  });

  test('redirects to home when Supabase returns a session', async () => {
    const harness = await loadSignupHarness({
      signUpImpl: async () => ({
        data: {
          user: { id: 'user-1', identities: [{ id: 'identity-1' }] },
          session: { access_token: 'token' },
        },
        error: null,
      }),
    });

    harness.elements.name.value = 'Coach';
    harness.elements.email.value = ' coach@example.com ';
    harness.elements.password.value = 'secret1';

    await harness.handleSignup({ preventDefault() {} });

    assert.equal(harness.signUpCalls.length, 1);
    assert.equal(harness.signUpCalls[0].email, 'coach@example.com');
    assert.equal(harness.signUpCalls[0].password, 'secret1');
    assert.equal(harness.signUpCalls[0].options.data.name, 'Coach');
    assert.equal(harness.locationState.href, '/index.html');
  });
});
