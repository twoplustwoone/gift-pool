// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import { default as defaultConfig } from '@epic-web/config/eslint'
import storybook from 'eslint-plugin-storybook'

/** @type {import("eslint").Linter.Config} */
export default [
	// add custom config objects here:
	...defaultConfig,
	...storybook.configs['flat/recommended'],
]
