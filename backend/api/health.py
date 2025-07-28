from http.server import BaseHTTPRequestHandler

def handler(request):
    origin = request.headers.get('Origin', '')
    allowed_origins = [
        'https://noxsub-45150.web.app',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
    ]
    cors_origin = origin if origin in allowed_origins else 'https://noxsub-45150.web.app'
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Credentials": "true",
            "Content-Type": "application/json"
        },
        "body": '{"status": "ok"}'
    }
