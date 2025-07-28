from http.server import BaseHTTPRequestHandler

def handler(request):
    # Get the origin from the request headers
    origin = request.headers.get('Origin', '')
    
    # List of allowed origins
    allowed_origins = [
        'https://noxsub-45150.web.app',  # Firebase domain
        'http://localhost:3000',          # Common React development port
        'http://localhost:5173',          # Vite default development port
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
    ]

    # Set the CORS header to the requesting origin if it's allowed, otherwise default to Firebase domain
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
        "body": '{"message": "Hello from Vercel Python Serverless!"}'
    }
