@echo off
setlocal
pushd "%~dp0..\.."
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -m tools.aromin_sync %*
) else (
  python -m tools.aromin_sync %*
)
set "AROMIN_SYNC_EXIT=%ERRORLEVEL%"
popd
exit /b %AROMIN_SYNC_EXIT%
