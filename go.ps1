# Start-WebServer.ps1

# 配置
$ProjectDirectory = $PSScriptRoot # 脚本所在的目录，假设你的HTML/JS文件也在这里或其子目录
$Port = 8886
$FileToOpen = "index.html" # 相对于 $ProjectDirectory 的文件

# 切换到项目目录
Set-Location $ProjectDirectory
Write-Host "当前工作目录: $(Get-Location)"

# 检查 http-server 是否可用
$httpServerExists = Get-Command http-server -ErrorAction SilentlyContinue
if (-not $httpServerExists) {
    Write-Error "错误: http-server 未找到。请确保 Node.js 已安装并通过 'npm install -g http-server' 安装了 http-server。"
    Read-Host "按 Enter 键退出"
    Exit 1
}

Write-Host "正在端口 $Port 上启动 http-server..."
# 在新的 PowerShell 窗口或后台进程中启动 http-server
# 使用 Start-Process 可以让脚本继续执行，而不是等待 http-server 结束
Start-Process powershell -ArgumentList "-NoExit", "-Command", "http-server -p $Port" -WindowStyle Minimized

# 等待服务器启动 (可以根据需要调整时间)
Write-Host "等待服务器启动 (5 秒)..."
Start-Sleep -Seconds 5

# 构建URL并在默认浏览器中打开
$URL = "http://localhost:$Port/$FileToOpen"
Write-Host "正在浏览器中打开: $URL"
Start-Process $URL

Write-Host "脚本执行完毕。http-server 正在后台运行。"
# Read-Host "按 Enter 键关闭此 PowerShell 窗口 (服务器将继续在另一个窗口运行)"