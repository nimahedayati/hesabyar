import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';

export default [
	{
		ignores: ['build/', '.svelte-kit/', 'node_modules/', 'shots/', 'package-lock.json']
	},
	js.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			ecmaVersion: 2025,
			sourceType: 'module',
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			eqeqeq: ['warn', 'smart']
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { svelteConfig }
		},
		rules: {
			// کامپوننت‌ها از runes استفاده می‌کنند؛ این قاعده در Svelte 5 لازم نیست
			'svelte/no-reactive-reassign': 'off',
			// برنامه تک‌زبانه و بدون base path است؛ resolve() لازم نیست
			'svelte/no-navigation-without-resolve': 'off',
			// فهرست‌های ثابت (مثل ردیف‌های اسکلتون) کلید طبیعی ندارند
			'svelte/require-each-key': 'off'
		}
	},
	{
		files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
		languageOptions: {
			sourceType: 'commonjs'
		},
		rules: {
			'no-console': 'off'
		}
	}
];
