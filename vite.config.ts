import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: {
      port: 5173, // Changed to match default Vite port
      strictPort: true, // Will fail if port is in use
      open: true // Opens the browser automatically
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      outDir: 'public', // <-- build para a pasta public
      emptyOutDir: true // limpa a pasta public antes do build
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom']
    }
  };
});
