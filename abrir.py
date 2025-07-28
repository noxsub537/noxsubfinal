import subprocess
import sys
import os
import signal
import time
import webbrowser
from pathlib import Path

def is_port_in_use(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

# Caminhos
WORKSPACE_DIR = Path(os.getcwd())
BACKEND_DIR = WORKSPACE_DIR / 'backend'
FRONTEND_DIR = WORKSPACE_DIR

# Verificar se os diretórios existem
if not BACKEND_DIR.exists():
    print(f'❌ O diretório do backend não foi encontrado em {BACKEND_DIR}. Por favor, verifique se a pasta existe.')
    sys.exit(1)

# Verificar se as portas estão disponíveiss
if is_port_in_use(8000):
    print('❌ A porta 8000 já está em uso. Feche outros programas que possam estar usando essa porta e tente novamente.')
    sys.exit(1)

if is_port_in_use(5173):
    print('❌ A porta 5173 já está em uso. Feche outros programas que possam estar usando essa porta e tente novamente.')
    sys.exit(1)

# Comandos
BACKEND_CMD = [sys.executable, '-m', 'uvicorn', 'app:app', '--reload']
FRONTEND_CMD = ['npm', 'run', 'dev'] if os.name != 'nt' else ['cmd', '/c', 'npm', 'run', 'dev']

processes = []

def cleanup():
    print('\nEncerrando todos os serviços. Aguarde um instante...')
    for proc in processes:
        if proc.poll() is None:  # se ainda está rodando
            try:
                if os.name == 'nt':
                    proc.terminate()
                else:
                    proc.send_signal(signal.SIGTERM)
            except Exception as e:
                print(f'⚠️  Erro ao encerrar processo: {e}')
    # Aguarda até 5 segundos para os processos terminarem
    for _ in range(5):
        if all(proc.poll() is not None for proc in processes):
            break
        time.sleep(1)
    # Força o encerramento se necessário
    for proc in processes:
        if proc.poll() is None:
            try:
                proc.kill()
            except Exception as e:
                print(f'⚠️  Erro ao forçar encerramento: {e}')

try:
    print('🚀 Iniciando o backend...')
    backend_proc = subprocess.Popen(BACKEND_CMD, cwd=BACKEND_DIR)
    processes.append(backend_proc)

    time.sleep(2)

    print('🚀 Iniciando o frontend...')
    frontend_proc = subprocess.Popen(FRONTEND_CMD, cwd=FRONTEND_DIR)
    processes.append(frontend_proc)

    print('\n✅ Tudo pronto! Seus serviços estão rodando:')
    print('   - Backend:  http://localhost:8000')
    print('   - Frontend: http://localhost:5173')
    print('\n🌐 O navegador será aberto automaticamente. Aproveite!')
    print('\nPara encerrar, pressione Ctrl+C a qualquer momento.')

    time.sleep(2)
    webbrowser.open('http://localhost:5173')

    while True:
        if backend_proc.poll() is not None:
            print('❗ O backend foi finalizado inesperadamente. Verifique os logs para mais detalhes.')
            break
        if frontend_proc.poll() is not None:
            print('❗ O frontend foi finalizado inesperadamente. Verifique os logs para mais detalhes.')
            break
        time.sleep(1)

except KeyboardInterrupt:
    print('\n⏹️  Interrupção detectada pelo usuário. Encerrando...')

finally:
    cleanup()
    print('👋 Finalizado. Até logo!')
