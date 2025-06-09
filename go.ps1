# Start-WebServer.ps1

# ����
$ProjectDirectory = $PSScriptRoot # �ű����ڵ�Ŀ¼���������HTML/JS�ļ�Ҳ�����������Ŀ¼
$Port = 8886
$FileToOpen = "index.html" # ����� $ProjectDirectory ���ļ�

# �л�����ĿĿ¼
Set-Location $ProjectDirectory
Write-Host "��ǰ����Ŀ¼: $(Get-Location)"

# ��� http-server �Ƿ����
$httpServerExists = Get-Command http-server -ErrorAction SilentlyContinue
if (-not $httpServerExists) {
    Write-Error "����: http-server δ�ҵ�����ȷ�� Node.js �Ѱ�װ��ͨ�� 'npm install -g http-server' ��װ�� http-server��"
    Read-Host "�� Enter ���˳�"
    Exit 1
}

Write-Host "���ڶ˿� $Port ������ http-server..."
# ���µ� PowerShell ���ڻ��̨���������� http-server
# ʹ�� Start-Process �����ýű�����ִ�У������ǵȴ� http-server ����
Start-Process powershell -ArgumentList "-NoExit", "-Command", "http-server -p $Port" -WindowStyle Minimized

# �ȴ����������� (���Ը�����Ҫ����ʱ��)
Write-Host "�ȴ����������� (5 ��)..."
Start-Sleep -Seconds 5

# ����URL����Ĭ��������д�
$URL = "http://localhost:$Port/$FileToOpen"
Write-Host "����������д�: $URL"
Start-Process $URL

Write-Host "�ű�ִ����ϡ�http-server ���ں�̨���С�"
# Read-Host "�� Enter ���رմ� PowerShell ���� (����������������һ����������)"