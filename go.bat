@echo off

:: 启动Python HTTP服务器
start python -m http.server 8886

:: 等待一段时间以确保服务器已经完全启动
timeout /t 5 /nobreak >nul

:: 使用默认浏览器打开指定URL
start http://localhost:8886/