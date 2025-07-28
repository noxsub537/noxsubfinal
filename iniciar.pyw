import subprocess, sys, os, threading, time, tkinter as tk, socket
from tkinter import ttk, scrolledtext as st
from pathlib import Path
from datetime import datetime

try: import psutil
except ImportError: psutil = None

WORKSPACE_DIR = Path(os.getcwd())
BACKEND_DIR = WORKSPACE_DIR / 'backend'
FRONTEND_DIR = WORKSPACE_DIR
backend_proc = frontend_proc = None
backend_status = frontend_status = "stopped"

class ModernPanel:
    def __init__(self):
        self.backend_port = self.frontend_port = None
        self._start_both_lock = threading.Lock()
        self._start_both_thread = None
        self.kill_python_zombies()
        self.root = tk.Tk()
        self.root.title("NoxSub Server Control Panel")
        self.root.geometry("1200x800")
        self.root.configure(bg='#1a1b23')
        self.colors = {
            'bg_primary': '#1a1b23', 'bg_secondary': '#242530', 'bg_card': '#2a2b3a', 'bg_input': '#343546',
            'purple_primary': '#8b5cf6', 'purple_secondary': '#a855f7', 'purple_accent': '#c084fc',
            'text_primary': '#ffffff', 'text_secondary': '#a1a1aa', 'text_muted': '#71717a',
            'success': '#22c55e', 'warning': '#f59e0b', 'error': '#ef4444', 'border': '#3f3f46'
        }
        try: self.root.iconbitmap(default='')
        except: pass
        self.setup_styles(); self.create_widgets(); self.animate_startup()

    def kill_python_zombies(self):
        if not psutil: return
        killed = 0
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    if proc.info['name'] in ['python', 'python.exe', 'uvicorn', 'node', 'npm'] and any(x in ' '.join(proc.info['cmdline'] or []) for x in ['uvicorn', 'vite', 'dev']):
                        proc.kill(); killed += 1
                except: continue
            if killed: print(f"Cleaned {killed} zombie processes")
        except: pass

    def setup_styles(self):
        style = ttk.Style(); style.theme_use('clam')
        style.configure('Modern.TFrame', background=self.colors['bg_primary'])
        style.configure('Card.TFrame', background=self.colors['bg_card'], relief='flat', borderwidth=1)

    def create_gradient_button(self, parent, text, command, width=120, height=32):
        canvas = tk.Canvas(parent, width=width, height=height, highlightthickness=0, relief='flat', bg=self.colors['bg_primary'])
        gradient = canvas.create_rectangle(0, 0, width, height, fill=self.colors['purple_primary'], outline='', tags='gradient')
        text_item = canvas.create_text(width//2, height//2, text=text, fill='white', font=('Inter', 10, 'bold'), tags='text')
        def on_enter(e): canvas.itemconfig(gradient, fill=self.colors['purple_secondary']); canvas.configure(cursor='hand2')
        def on_leave(e): canvas.itemconfig(gradient, fill=self.colors['purple_primary']); canvas.configure(cursor='')
        def on_click(e): canvas.itemconfig(gradient, fill=self.colors['purple_accent']); self.root.after(80, lambda: canvas.itemconfig(gradient, fill=self.colors['purple_secondary'])); command()
        for event in ['<Enter>', '<Leave>', '<Button-1>']: canvas.bind(event, [on_enter, on_leave, on_click][['<Enter>', '<Leave>', '<Button-1>'].index(event)])
        for tag in ['gradient', 'text']: canvas.tag_bind(tag, '<Button-1>', on_click)
        return canvas

    def create_stop_button(self, parent, text, command, width=120, height=32):
        canvas = tk.Canvas(parent, width=width, height=height, highlightthickness=0, relief='flat', bg=self.colors['bg_card'])
        gradient = canvas.create_rectangle(0, 0, width, height, fill='#4a4a4a', outline='', tags='gradient')
        text_item = canvas.create_text(width//2, height//2, text=text, fill=self.colors['text_secondary'], font=('Inter', 10, 'bold'), tags='text')
        def on_enter(e): canvas.itemconfig(gradient, fill=self.colors['error']); canvas.itemconfig(text_item, fill='white'); canvas.configure(cursor='hand2')
        def on_leave(e): canvas.itemconfig(gradient, fill='#4a4a4a'); canvas.itemconfig(text_item, fill=self.colors['text_secondary']); canvas.configure(cursor='')
        def on_click(e): canvas.itemconfig(gradient, fill='#dc2626'); self.root.after(80, lambda: canvas.itemconfig(gradient, fill=self.colors['error'])); command()
        for event in ['<Enter>', '<Leave>', '<Button-1>']: canvas.bind(event, [on_enter, on_leave, on_click][['<Enter>', '<Leave>', '<Button-1>'].index(event)])
        for tag in ['gradient', 'text']: canvas.tag_bind(tag, '<Button-1>', on_click)
        return canvas

    def create_widgets(self):
        main_container = tk.Frame(self.root, bg=self.colors['bg_primary']); main_container.pack(fill='both', expand=True, padx=18, pady=18)
        header_frame = tk.Frame(main_container, bg=self.colors['bg_primary']); header_frame.pack(fill='x', pady=(0, 18))
        title_frame = tk.Frame(header_frame, bg=self.colors['bg_primary']); title_frame.pack(side='left')
        icon_canvas = tk.Canvas(title_frame, width=32, height=32, highlightthickness=0, bg=self.colors['bg_primary'])
        icon_canvas.pack(side='left', padx=(0, 10))
        icon_canvas.create_rectangle(4, 4, 28, 28, fill=self.colors['purple_primary'], outline='', width=0)
        icon_canvas.create_text(16, 16, text='⚡', fill='white', font=('Inter', 13))
        title_label = tk.Label(title_frame, text="NoxSub Server Control", bg=self.colors['bg_primary'], fg=self.colors['text_primary'], font=('Inter', 18, 'bold'))
        title_label.pack(side='left', anchor='w')
        content_container = tk.Frame(main_container, bg=self.colors['bg_primary']); content_container.pack(fill='both', expand=True)
        left_container = tk.Frame(content_container, bg=self.colors['bg_primary']); left_container.pack(side='left', fill='y', padx=(0, 10))
        servers_frame = tk.Frame(left_container, bg=self.colors['bg_primary']); servers_frame.pack(fill='x', pady=(0, 10))
        self.backend_card = self.create_server_card(servers_frame, "Backend Server", "FastAPI • Uvicorn • Hot Reload", "backend"); self.backend_card.pack(fill='x', pady=(0, 8))
        self.frontend_card = self.create_server_card(servers_frame, "Frontend Server", "React • Vite • Development Mode", "frontend"); self.frontend_card.pack(fill='x', pady=(0, 8))
        buttons_container = tk.Frame(servers_frame, bg=self.colors['bg_primary']); buttons_container.pack(fill='x', pady=(8, 0))
        launch_btn = self.create_gradient_button(buttons_container, "Launch All", self.threaded_start_both, width=120, height=32); launch_btn.pack(side='left', padx=(0, 8))
        kill_all_btn = self.create_stop_button(buttons_container, "Kill All", self.kill_all, width=120, height=32); kill_all_btn.pack(side='left')
        right_container = tk.Frame(content_container, bg=self.colors['bg_primary']); right_container.pack(side='right', fill='both', expand=True)
        logs_card = self.create_logs_card(right_container); logs_card.pack(fill='both', expand=True, pady=(0, 0))
        clear_btn = self.create_gradient_button(right_container, "Limpar Console", self.clear_console, width=110, height=28); clear_btn.pack(anchor='ne', padx=6, pady=6)

    def clear_console(self):
        self.log_area.configure(state='normal'); self.log_area.delete('1.0', tk.END); self.log_area.configure(state='disabled')

    def create_server_card(self, parent, title, subtitle, server_type):
        card_frame = tk.Frame(parent, bg=self.colors['bg_card'], relief='flat', bd=1, highlightbackground=self.colors['border'], highlightthickness=1)
        inner_frame = tk.Frame(card_frame, bg=self.colors['bg_card']); inner_frame.pack(fill='both', expand=True, padx=20, pady=20)
        header_frame = tk.Frame(inner_frame, bg=self.colors['bg_card']); header_frame.pack(fill='x', pady=(0, 15))
        title_label = tk.Label(header_frame, text=title, bg=self.colors['bg_card'], fg=self.colors['text_primary'], font=('Inter', 16, 'bold')); title_label.pack(anchor='w')
        subtitle_label = tk.Label(header_frame, text=subtitle, bg=self.colors['bg_card'], fg=self.colors['text_secondary'], font=('Inter', 10)); subtitle_label.pack(anchor='w', pady=(2, 0))
        status_frame = tk.Frame(inner_frame, bg=self.colors['bg_card']); status_frame.pack(fill='x', pady=(0, 15))
        status_canvas = tk.Canvas(status_frame, width=12, height=12, highlightthickness=0, bg=self.colors['bg_card']); status_canvas.pack(side='left')
        status_dot = status_canvas.create_oval(2, 2, 10, 10, fill=self.colors['error'], outline='')
        status_text = tk.Label(status_frame, text="Stopped", bg=self.colors['bg_card'], fg=self.colors['text_secondary'], font=('Inter', 11, 'bold'))
        status_text.pack(side='left', padx=(8, 0))
        port_label = tk.Label(status_frame, text="", bg=self.colors['bg_card'], fg=self.colors['text_muted'], font=('Inter', 10, 'italic'))
        port_label.pack(side='left', padx=(8, 0))
        buttons_frame = tk.Frame(inner_frame, bg=self.colors['bg_card']); buttons_frame.pack(fill='x', pady=(0, 0))
        start_command = self.start_backend if server_type == "backend" else self.start_frontend
        stop_command = self.stop_backend if server_type == "backend" else self.stop_frontend
        action_btn = self.create_gradient_button(buttons_frame, f"Start {server_type.title()}", start_command, width=130, height=35); action_btn.pack(side='left', padx=(0, 10))
        stop_btn = self.create_stop_button(buttons_frame, f"Stop {server_type.title()}", stop_command, width=130, height=35); stop_btn.pack(side='left')
        card_data = {'frame': card_frame, 'status_canvas': status_canvas, 'status_dot': status_dot, 'status_text': status_text, 'port_label': port_label, 'action_btn': action_btn, 'stop_btn': stop_btn}
        setattr(self, f'{server_type}_card_data', card_data)
        return card_frame

    def create_logs_card(self, parent):
        card_frame = tk.Frame(parent, bg=self.colors['bg_card'], relief='flat', bd=1, highlightbackground=self.colors['border'], highlightthickness=1)
        inner_frame = tk.Frame(card_frame, bg=self.colors['bg_card']); inner_frame.pack(fill='both', expand=True, padx=8, pady=8)
        header_frame = tk.Frame(inner_frame, bg=self.colors['bg_card']); header_frame.pack(fill='x', pady=(0, 6))
        title_label = tk.Label(header_frame, text="📈 System Logs", bg=self.colors['bg_card'], fg=self.colors['success'], font=('JetBrains Mono', 11, 'bold')); title_label.pack(side='left')
        self.log_area = st.ScrolledText(inner_frame, wrap=tk.WORD, state='disabled', bg='#232336', fg=self.colors['text_primary'], font=('JetBrains Mono', 8), insertbackground=self.colors['text_primary'], relief='flat', bd=0, padx=4, pady=4, selectbackground=self.colors['purple_primary'], highlightbackground='#343546', highlightcolor='#8b5cf6', borderwidth=1)
        self.log_area.pack(fill='both', expand=True)
        for tag, color in [('backend', '#60a5fa'), ('frontend', '#fbbf24'), ('system', '#a1a1aa'), ('success', '#22c55e'), ('warning', '#f59e0b'), ('error', '#ef4444')]:
            self.log_area.tag_configure(tag, foreground=color, font=('JetBrains Mono', 8, 'bold' if tag in ['backend', 'frontend', 'success', 'warning', 'error'] else ''))
        return card_frame

    def update_server_status(self, server_type, status):
        card_data = getattr(self, f'{server_type}_card_data')
        global backend_status, frontend_status
        if server_type == "backend": backend_status = status
        else: frontend_status = status
        colors_map = {"running": self.colors['success'], "starting": self.colors['warning'], "stopped": self.colors['error']}
        text_map = {"running": ('Running', self.colors['success']), "starting": ('Starting...', self.colors['warning']), "stopped": ('Stopped', self.colors['text_secondary'])}
        card_data['status_canvas'].itemconfig(card_data['status_dot'], fill=colors_map.get(status, self.colors['error']))
        text, color = text_map.get(status, ('Stopped', self.colors['text_secondary']))
        card_data['status_text'].configure(text=text, fg=color)
        # Atualiza a porta exibida
        port = None
        if server_type == "backend":
            port = getattr(self, 'backend_port', None)
        else:
            port = getattr(self, 'frontend_port', None)
        if port:
            card_data['port_label'].configure(text=f"Porta: {port}")
        else:
            card_data['port_label'].configure(text="")

    def is_port_in_use(self, port):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                return s.connect_ex(('localhost', port)) == 0
        except: return True

    def find_available_port(self, start_port, max_attempts=10):
        for i in range(max_attempts):
            port = start_port + i
            if not self.is_port_in_use(port): return port
        return None

    def kill_processes_on_port(self, port):
        if not psutil: return
        killed = 0
        try:
            for proc in psutil.process_iter(['pid', 'name', 'connections']):
                try:
                    for conn in proc.info['connections'] or []:
                        if hasattr(conn, 'laddr') and conn.laddr and conn.laddr.port == port:
                            proc.kill(); killed += 1; break
                except: continue
            if killed: time.sleep(1)
        except: pass

    def save_backend_port(self, port):
        try:
            import json
            with open(os.path.join(WORKSPACE_DIR, 'backend_port.json'), 'w') as f:
                json.dump({'port': port}, f)
        except Exception as e:
            self.append_log(f"Erro ao salvar backend_port.json: {e}", "error")

    def kill_ports_in_use(self):
        import subprocess
        import re
        ports = [5173, 8000]
        for port in ports:
            try:
                result = subprocess.run(
                    f'netstat -aon | findstr :{port}',
                    capture_output=True, text=True, shell=True
                )
                output = result.stdout.strip()
                if output:
                    pids = set(re.findall(r'LISTENING\s+(\d+)', output))
                    if pids:
                        self.append_log(f'🔍 Porta {port} está sendo usada pelos PIDs: {", ".join(pids)}', "warning")
                        for pid in pids:
                            self.append_log(f'⚡ Encerrando processo PID {pid}...', "warning")
                            subprocess.run(f'taskkill /PID {pid} /F', shell=True)
                    else:
                        self.append_log(f'⚠ Porta {port} está em uso, mas não consegui encontrar PID em estado LISTENING.', "warning")
                else:
                    self.append_log(f'✅ Porta {port} está livre.', "success")
            except Exception as e:
                self.append_log(f'Erro ao checar porta {port}: {e}', "error")

    def start_backend(self):
        global backend_proc
        self.kill_ports_in_use()  # Garante que as portas estejam livres
        if backend_proc and backend_proc.poll() is None: self.append_log("Backend já rodando.", "warning"); return
        if not BACKEND_DIR.exists(): self.append_log(f"❌ Diretório backend não encontrado.", "error"); self.update_server_status("backend", "stopped"); return
        port = 8000  # Porta fixa para backend
        self.kill_processes_on_port(port)
        cmd = [sys.executable, '-m', 'uvicorn', 'app:app', '--reload', '--port', str(port)]
        self.update_server_status("backend", "starting")
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            backend_proc = subprocess.Popen(cmd, cwd=BACKEND_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=creationflags, text=True, bufsize=1)
            threading.Thread(target=self.read_output, args=(backend_proc, "Backend"), daemon=True).start()
            self.update_server_status("backend", "running")
            self.append_log(f"Backend ativo porta {port}!", "success")
            self.backend_port = port
            self.save_backend_port(port)
        except Exception as e: self.append_log("Erro backend", "error", error_detail=str(e)); self.update_server_status("backend", "stopped")

    def start_frontend(self):
        global frontend_proc
        port = 5173  # Porta fixa para frontend
        self.kill_ports_in_use()  # Garante que as portas estejam livres
        if self.is_port_in_use(port):
            self.append_log(f"Erro: Porta {port} já está em uso. Feche o processo que está usando essa porta ou altere a porta fixa.", "error")
            self.update_server_status("frontend", "stopped")
            return
        if frontend_proc and frontend_proc.poll() is None: self.append_log("Frontend já rodando.", "warning"); return
        self.kill_processes_on_port(port)
        cmd = ['cmd', '/c', f'npm run dev -- --port {port} --host'] if os.name == 'nt' else ['npm', 'run', 'dev', '--', '--port', str(port), '--host']
        self.update_server_status("frontend", "starting")
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            frontend_proc = subprocess.Popen(cmd, cwd=FRONTEND_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=creationflags, text=True, bufsize=1)
            threading.Thread(target=self.read_output, args=(frontend_proc, "Frontend"), daemon=True).start()
            time.sleep(3)
            if frontend_proc.poll() is None: self.update_server_status("frontend", "running"); self.append_log(f"Frontend ativo porta {port}!", "success"); self.frontend_port = port
            else: self.update_server_status("frontend", "stopped"); self.append_log("Frontend falhou.", "error")
        except Exception as e: self.append_log("Erro frontend", "error", error_detail=str(e)); self.update_server_status("frontend", "stopped")

    def stop_backend(self):
        global backend_proc
        if backend_proc and backend_proc.poll() is None: self.force_kill_process(backend_proc, "Backend"); self.update_server_status("backend", "stopped"); self.append_log("Backend parado!", "system")
        else: self.append_log("Backend não rodando", "warning")

    def stop_frontend(self):
        global frontend_proc
        if frontend_proc and frontend_proc.poll() is None: self.force_kill_process(frontend_proc, "Frontend"); self.update_server_status("frontend", "stopped"); self.append_log("Frontend parado!", "system")
        else: self.append_log("Frontend não rodando", "warning")

    def kill_all(self):
        self.append_log("PARANDO TODOS...", "warning")
        self.stop_backend(); self.stop_frontend()
        if hasattr(self, 'backend_port') and self.backend_port: self.kill_processes_on_port(self.backend_port)
        if hasattr(self, 'frontend_port') and self.frontend_port: self.kill_processes_on_port(self.frontend_port)
        self.append_log("Tudo parado!", "system")

    def start_both(self):
        if not self._start_both_lock.acquire(blocking=False): self.append_log("Já iniciando.", "warning"); return
        try:
            if not (backend_proc and backend_proc.poll() is None): self.start_backend(); time.sleep(2)
            else: self.append_log("Backend já rodando.", "warning")
            if not (frontend_proc and frontend_proc.poll() is None): self.start_frontend()
            else: self.append_log("Frontend já rodando.", "warning")
            backend_ok = backend_proc and backend_proc.poll() is None
            frontend_ok = frontend_proc and frontend_proc.poll() is None
            if backend_ok and frontend_ok:
                self.append_log("✔ Ambos ativos!", "success")
                self.append_log(f"Backend: http://localhost:{getattr(self, 'backend_port', 8000)}", "success")
                self.append_log(f"Frontend: http://localhost:{getattr(self, 'frontend_port', 5173)}", "success")
            elif backend_ok: self.append_log(f"✔ Só backend ativo!", "success")
            elif frontend_ok: self.append_log(f"✔ Só frontend ativo!", "success")
            else: self.append_log("✖ Nada iniciado.", "error")
        finally: self._start_both_lock.release()

    def threaded_start_both(self):
        if self._start_both_thread and self._start_both_thread.is_alive(): self.append_log("Já iniciando.", "warning"); return
        self._start_both_thread = threading.Thread(target=self.start_both, daemon=True); self._start_both_thread.start()

    def read_output(self, proc, name):
        while True:
            try:
                line = proc.stdout.readline()
                if not line: break
                decoded = line.strip()
                if decoded:
                    if any(kw in decoded.lower() for kw in ["error", "failed", "exception", "traceback"]): self.append_log(f"[{name}] {decoded}", "error")
                    else: self.append_log(f"[{name}] {decoded}", "backend" if name == "Backend" else "frontend")
            except Exception as e: self.append_log(f"Erro lendo {name}: {str(e)}", "error"); break

    def append_log(self, message, tag="system", error_detail=None):
        try:
            timestamp = datetime.now().strftime("%H:%M:%S")
            icons = {'success': '✔', 'warning': '⚠', 'error': '✖', 'backend': '🔧', 'frontend': '💻', 'system': '📈'}
            icon = icons.get(tag, '')
            formatted = f"[{timestamp}] [ERRO] {icon} {message}" + (f"\n    → {error_detail}" if error_detail else "") if tag == 'error' else f"[{timestamp}] {icon} {message}"
            self.log_area.configure(state='normal')
            self.log_area.insert(tk.END, formatted + "\n", tag)
            self.log_area.configure(state='disabled')
            self.log_area.see(tk.END)
        except Exception as e: print(f"Log erro: {e}")

    def animate_startup(self):
        self.append_log("Sistema pronto!", "success")
        self.append_log("=" * 50, "system")

    def force_kill_process(self, process, name):
        if not process or process.poll() is not None: return
        try:
            process.terminate() if os.name == 'nt' else process.send_signal(__import__('signal').SIGTERM)
            for _ in range(30):
                if process.poll() is not None: break
                time.sleep(0.1)
            if process.poll() is None:
                try: subprocess.run(['taskkill', '/F', '/T', '/PID', str(process.pid)], capture_output=True) if os.name == 'nt' else process.kill()
                except: pass
                finally:
                    try: process.wait(timeout=1)
                    except: pass
        except: pass

    def on_close(self):
        global backend_proc, frontend_proc
        if backend_proc and backend_proc.poll() is None: self.force_kill_process(backend_proc, "Backend")
        if frontend_proc and frontend_proc.poll() is None: self.force_kill_process(frontend_proc, "Frontend")
        self.root.destroy()

    def run(self):
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.mainloop()

if __name__ == "__main__": ModernPanel().run()