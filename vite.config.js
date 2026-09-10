import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'

/**
 * 서버 기동 시 접속 가능한 Network 주소(IP)를 명시적으로 출력한다.
 * (사내망에서 다른 PC/모바일로 접속할 때 필요)
 */
function printNetworkAddress() {
  return {
    name: 'subclean-print-network-address',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const port = server.config.server.port ?? 5173
        const nets = os.networkInterfaces()
        const ips = []
        for (const name of Object.keys(nets)) {
          for (const net of nets[name] ?? []) {
            if (net.family === 'IPv4' && !net.internal) {
              ips.push({ name, address: net.address })
            }
          }
        }
        setTimeout(() => {
          console.log('')
          console.log('  ┌───────────────────────────────────────────────┐')
          console.log('  │  SubClean 개발 서버 접속 주소                 │')
          console.log('  └───────────────────────────────────────────────┘')
          console.log(`  Local    : http://localhost:${port}/`)
          if (ips.length === 0) {
            console.log('  Network  : (외부 네트워크 인터페이스를 찾을 수 없습니다)')
          } else {
            ips.forEach((ip) => {
              console.log(`  Network  : http://${ip.address}:${port}/   [${ip.name}]`)
            })
          }
          console.log('')
        }, 50)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), printNetworkAddress()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // ngrok 등 외부 터널 주소로 접속할 때 Vite의 host 차단을 방지 (도메인이 바뀌어도 되도록 전체 허용)
    allowedHosts: true,
  },
})
