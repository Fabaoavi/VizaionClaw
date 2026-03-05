@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo   GRAVITY CLAW - LOCAL IP CHANGER SCRIPT
echo ============================================

:: 1. Find the accurate IPv4
echo [1] Procurando Novo Endereco IP local na rede...
set "NEW_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4"') do (
    set "IP_LINE=%%A"
    :: Clean spaces
    set "NEW_IP=!IP_LINE: =!"
    :: Use the first one found (usually the active adapter)
    goto :FoundIP
)

:FoundIP
:: If IP is empty something failed
if "%NEW_IP%"=="" (
    echo.
    echo [X] AVARIA: Falha ao detectar IPv4 ativo. Voce esta conectado a uma rede?
    echo Pressione qualquer tecla para fechar...
    pause >nul
    exit /b 1
)

echo.
echo =^> Encontrado IP Atual Válido: !NEW_IP!
echo.

:: 2. Search and Replace in .env
echo [2] Atualizando '.env' da pasta VizaionClaw com a variavel MC_BASE_URL...
set "ENV_FILE=c:\Users\fabao\Documents\VizaionClaw\.env"
set "TEMP_FILE=%ENV_FILE%.tmp"

:: Check if .env exists
if not exist "%ENV_FILE%" (
    echo.
    echo [X] AVARIA: O Arquivo .env nao foi encontrado no diretorio:
    echo %ENV_FILE%
    pause
    exit /b 1
)

:: We erase any old tempoary file
if exist "%TEMP_FILE%" del "%TEMP_FILE%"

for /f "tokens=* delims=" %%L in (%ENV_FILE%) do (
    set "LINE=%%L"
    echo !LINE! | findstr /b /c:"MC_BASE_URL=" >nul
    if !errorlevel! equ 0 (
        echo MC_BASE_URL=http://!NEW_IP!:3000>>"%TEMP_FILE%"
    ) else (
        echo !LINE!>>"%TEMP_FILE%"
    )
)

:: Replace old with new
move /Y "%TEMP_FILE%" "%ENV_FILE%" >nul

echo =^> O arquivo .env foi atualizado com sucesso.

echo.
:: 3. Restart process
echo [3] Parando bots travados antigos e Dashboards Node.js...
taskkill /F /IM node.exe >nul 2>&1
echo =^> Processos encerrados.

echo.
echo [4] Reiniciando Gravity Claw (Wait for terminal loading)...
echo.
wscript c:\Users\fabao\Documents\VizaionClaw\start-hidden.vbs

echo ============================================
echo   MUDANCA FINALIZADA COM SUCESSO!
echo ============================================
echo O IP VizaionDashboard agora e: http://%NEW_IP%:3000
echo.
pause
