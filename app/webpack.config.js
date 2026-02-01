var path = require('path'),
    webpack = require('webpack'),
    ESLintPlugin = require('eslint-webpack-plugin'),
    pkg = require('./package.json'),
    DEBUG = process.env.NODE_ENV !== 'production',
    entry = [
        './src/app.js',
    ]

module.exports = {
    context: path.join(__dirname, './'),
    entry: entry,
    target: 'web',
    mode: DEBUG ? 'development' : 'production',
    devtool: DEBUG ? 'inline-source-map' : false,
    output: {
        library: {
            name: 'App',
            type: 'umd',
            export: 'default'
        },
        path: path.resolve(pkg.config.buildDir),
        publicPath: DEBUG ? '/' : './',
        filename: DEBUG ? 'app.js' : 'app-[contenthash].js'
    },
    resolve: {
        fallback: {
            fs: false
        }
    },
    plugins: [
        new ESLintPlugin({
            extensions: ['js'],
            exclude: ['node_modules', 'src/vendor']
        })
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
                options: {
                    plugins: ['@babel/plugin-transform-runtime'],
                    presets: ['@babel/preset-env']
                }
            },
            {test: /\.html$/, exclude: /node_modules/, type: 'asset/resource', generator: { filename: '[path][name][ext]' }},
            {test: /\.jpe?g$|\.svg$|\.png$/, exclude: /node_modules/, type: 'asset/resource', generator: { filename: '[path][name][ext]' }},
            {test: /\.(otf|eot|svg|ttf|woff|woff2)(\?v=\d+\.\d+\.\d+)?$/, type: 'asset/inline'}
        ]
    },
    performance: {
        hints: false
    }
}
