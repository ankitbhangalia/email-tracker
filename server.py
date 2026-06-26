import http.server
import socketserver
import json
import urllib.parse
import sqlite3
import os
import re
import datetime
import mimetypes

PORT = 3000
DB_FILE = 'leads.db'
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(SCRIPT_DIR, 'public')
if not os.path.exists(PUBLIC_DIR) or not os.path.exists(os.path.join(PUBLIC_DIR, 'index.html')):
    PUBLIC_DIR = SCRIPT_DIR

# 1x1 transparent GIF tracking pixel
TRACKING_PIXEL = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            company TEXT,
            requirement TEXT NOT NULL,
            submission_time TEXT NOT NULL,
            ai_category TEXT NOT NULL,
            ai_priority TEXT NOT NULL,
            email_sent INTEGER DEFAULT 1,
            email_opened INTEGER DEFAULT 0,
            email_opened_time TEXT,
            link_clicked INTEGER DEFAULT 0,
            link_clicked_time TEXT
        )
    ''')
    
    # Check if table is empty and seed initial demo data
    cursor.execute("SELECT COUNT(*) FROM leads")
    count = cursor.fetchone()[0]
    if count == 0:
        now = datetime.datetime.now()
        time1 = (now - datetime.timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        time2 = (now - datetime.timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        time3 = (now - datetime.timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
        
        cursor.executemany('''
            INSERT INTO leads (name, email, phone, company, requirement, submission_time, ai_category, ai_priority, email_sent, email_opened, email_opened_time, link_clicked, link_clicked_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            ('Rahul Sharma', 'rahul@gmail.com', '9876543210', 'ABC Pvt Ltd', 'Need AI automation', time1, 'AI Automation', 'High', 1, 1, time1, 1, time1),
            ('Priya Patel', 'priya@gmail.com', '9988776655', 'Tech Solutions', 'I need a website for my portfolio asap', time2, 'Web Development', 'High', 1, 1, time2, 0, None),
            ('Amit Kumar', 'amit@yahoo.com', '9123456789', 'Individual', 'App development query', time3, 'App Development', 'Medium', 1, 0, None, 0, None)
        ])
        
    conn.commit()
    conn.close()

def classify_lead(requirement):
    req_lower = requirement.lower()
    
    # AI Category Classification
    if any(kw in req_lower for kw in ['ai', 'chatbot', 'bot', 'automation', 'gpt', 'llm', 'agent', 'intelligent']):
        category = 'AI Automation'
    elif any(kw in req_lower for kw in ['website', 'design', 'portfolio', 'landing page', 'web', 'frontend', 'backend', 'html', 'css']):
        category = 'Web Development'
    elif any(kw in req_lower for kw in ['app', 'mobile', 'ios', 'android', 'application']):
        category = 'App Development'
    elif any(kw in req_lower for kw in ['seo', 'marketing', 'ad', 'social media', 'traffic']):
        category = 'Digital Marketing'
    else:
        category = 'General Inquiry'
        
    # AI Priority Classification
    if any(kw in req_lower for kw in ['urgent', 'asap', 'immediate', 'now', 'critical', 'soon', 'quickly']):
        priority = 'High'
    elif len(requirement) > 40:
        priority = 'Medium'
    else:
        priority = 'Low'
        
    return category, priority
    class HTTPHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Clean url query strings
        parsed = urllib.parse.urlparse(path)
        clean_path = urllib.parse.unquote(parsed.path)
        
        # Prevent directory traversal attacks
        parts = clean_path.split('/')
        safe_parts = []
        for part in parts:
            if not part or part == '.':
                continue
            if part == '..':
                if safe_parts:
                    safe_parts.pop()
                continue
            safe_parts.append(part)
            
        resolved_path = os.path.join(PUBLIC_DIR, *safe_parts)
        
        if os.path.isdir(resolved_path):
            resolved_path = os.path.join(resolved_path, 'index.html')
            
        return resolved_path

    def do_GET(self):
        # Open tracking endpoint
        open_match = re.match(r'^/track/open/(\d+)$', self.path)
        if open_match:
            lead_id = int(open_match.group(1))
            self.track_open(lead_id)
            return

        # Link click tracking endpoint
        click_match = re.match(r'^/track/click/(\d+)$', self.path)
        if click_match:
            lead_id = int(click_match.group(1))
            self.track_click(lead_id)
            return

        # REST API endpoints
        if self.path == '/api/leads':
            self.get_leads()
            return
        elif self.path == '/api/stats':
            self.get_stats()
            return

        # Serve static files
        resolved_path = self.translate_path(self.path)
        if not os.path.exists(resolved_path):
            # SPA fallback: serve index.html if the file doesn't exist
            self.path = '/index.html'

        super().do_GET()

    def do_POST(self):
        if self.path == '/api/leads':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                self.create_lead(data)
            except Exception as e:
                self.send_error_response(400, f"Invalid request data: {str(e)}")
            return
        
        self.send_error_response(404, "Not Found")

    def track_open(self, lead_id):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT email_opened FROM leads WHERE id = ?", (lead_id,))
            row = cursor.fetchone()
            if row and row[0] == 0:
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    "UPDATE leads SET email_opened = 1, email_opened_time = ? WHERE id = ?",
                    (now_str, lead_id)
                )
                conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error tracking open: {e}")

        # Return 1x1 transparent GIF
        self.send_response(200)
        self.send_header('Content-Type', 'image/gif')
        self.send_header('Content-Length', len(TRACKING_PIXEL))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        self.wfile.write(TRACKING_PIXEL)

    def track_click(self, lead_id):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT link_clicked FROM leads WHERE id = ?", (lead_id,))
            row = cursor.fetchone()
            if row and row[0] == 0:
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    "UPDATE leads SET link_clicked = 1, link_clicked_time = ? WHERE id = ?",
                    (now_str, lead_id)
                )
                conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error tracking click: {e}")

        # Redirect user back to simulated inbox success route
        self.send_response(302)
        self.send_header('Location', '/index.html?clicked=true#inbox')
        self.end_headers()

    def get_leads(self):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, name, email, phone, company, requirement, submission_time, 
                       ai_category, ai_priority, email_sent, email_opened, email_opened_time, 
                       link_clicked, link_clicked_time 
                FROM leads 
                ORDER BY id DESC
            ''')
            rows = cursor.fetchall()
            conn.close()

            leads = []
            for r in rows:
                leads.append({
                    'id': r[0],
                    'name': r[1],
                    'email': r[2],
                    'phone': r[3],
                    'company': r[4] or '',
                    'requirement': r[5],
                    'submission_time': r[6],
                    'ai_category': r[7],
                    'ai_priority': r[8],
                    'email_sent': bool(r[9]),
                    'email_opened': bool(r[10]),
                    'email_opened_time': r[11] or '',
                    'link_clicked': bool(r[12]),
                    'link_clicked_time': r[13] or ''
                })

            self.send_json_response(200, leads)
        except Exception as e:
            self.send_error_response(500, f"Database error: {str(e)}")

    def get_stats(self):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM leads")
            total_leads = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM leads WHERE email_sent = 1")
            total_sent = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM leads WHERE email_opened = 1")
            total_opened = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM leads WHERE link_clicked = 1")
            total_clicked = cursor.fetchone()[0]
            
            conn.close()

            open_rate = round((total_opened / total_sent * 100), 1) if total_sent > 0 else 0.0
            click_rate = round((total_clicked / total_sent * 100), 1) if total_sent > 0 else 0.0

            stats = {
                'totalLeads': total_leads,
                'emailsSent': total_sent,
                'emailsOpened': total_opened,
                'openRate': open_rate,
                'linksClicked': total_clicked,
                'clickRate': click_rate
            }

            self.send_json_response(200, stats)
        except Exception as e:
            self.send_error_response(500, f"Database error: {str(e)}")

    def create_lead(self, data):
        name = data.get('name')
        email = data.get('email')
        phone = data.get('phone')
        company = data.get('company', '')
        requirement = data.get('requirement')

        if not all([name, email, phone, requirement]):
            self.send_error_response(400, "Missing required fields")
            return

        ai_category, ai_priority = classify_lead(requirement)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO leads (name, email, phone, company, requirement, submission_time, ai_category, ai_priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (name, email, phone, company, requirement, now_str, ai_category, ai_priority))
            lead_id = cursor.lastrowid
            conn.commit()
            conn.close()

            self.send_json_response(201, {
                'id': lead_id,
                'name': name,
                'email': email,
                'phone': phone,
                'company': company,
                'requirement': requirement,
                'submission_time': now_str,
                'ai_category': ai_category,
                'ai_priority': ai_priority,
                'email_sent': True,
                'email_opened': False,
                'link_clicked': False
            })
        except Exception as e:
            self.send_error_response(500, f"Database write failed: {str(e)}")

    def send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_response(self, status, message):
        self.send_json_response(status, {'error': message})

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    init_db()
    print(f"Starting server on http://localhost:{PORT}")
    server = socketserver.TCPServer(("", PORT), HTTPHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("Server stopped.")
