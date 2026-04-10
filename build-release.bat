@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-release.ps1"
if errorlevel 1 (
  echo Falha ao gerar pacote.
  exit /b 1
)
echo Pacote gerado com sucesso.
