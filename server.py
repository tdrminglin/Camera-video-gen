# server.py (修正版)
import http.server
import socketserver

PORT = 8886

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 修正点: 先设置我们想要自定义的头
        if self.path.endswith('.js'):
            self.send_header('Content-type', 'application/javascript')
        
        # 修正点: 然后，无条件地调用父类的原始方法来完成所有收尾工作（包括写入空行）
        # 这样既保证了我们自定义的头被添加，也保证了HTTP响应的格式永远是正确的。
        http.server.SimpleHTTPRequestHandler.end_headers(self)

Handler = MyHttpRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("服务器运行在端口:", PORT)
    print("请在浏览器中打开 http://localhost:" + str(PORT))
    httpd.serve_forever()