import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: false,
      envPrefix: 'VITE_'
    }),
    alias: {
      $lib: './src/lib',
      $components: './src/lib/components',
      $stores: './src/lib/stores',
      $utils: './src/lib/utils',
      $api: './src/lib/api',
      $constants: './src/lib/constants'
    }
  }
};

export default config;
