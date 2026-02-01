import js from '@eslint/js'

export default [
    {
        ignores: ['node_modules/**', 'src/vendor/**', '**/vendor/**']
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                addEventListener: 'readonly',
                EventSource: 'readonly',
                fetch: 'readonly',
                URLSearchParams: 'readonly',
                PIXI: 'readonly'
            }
        },
        rules: {
            'no-loss-of-precision': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            semi: 'off',
            quotes: 'off'
        }
    }
]
