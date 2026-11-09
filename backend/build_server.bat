@echo off
REM Build backend\dist\essay-server.exe from server.py with PyInstaller.
REM
REM This script installs nothing: PyInstaller and the server's dependencies are
REM expected to be already installed in the current Python environment.
REM (pip install pyinstaller fastapi uvicorn httpx python-docx pypdf reportlab
REM  arabic-reshaper python-bidi python-multipart)
setlocal
cd /d "%~dp0"

where pyinstaller >nul 2>&1
if errorlevel 1 (
    echo build_server.bat: pyinstaller was not found in this environment. 1>&2
    echo Install it first with:  pip install pyinstaller 1>&2
    exit /b 1
)

pyinstaller --noconfirm --onefile --noconsole --name essay-server ^
    --add-data "fonts;fonts" ^
    --collect-all uvicorn ^
    --collect-all httpx ^
    --collect-all pydantic ^
    --copy-metadata fastapi ^
    --copy-metadata pydantic ^
    --hidden-import "uvicorn.logging" ^
    --hidden-import "uvicorn.loops" ^
    --hidden-import "uvicorn.loops.auto" ^
    --hidden-import "uvicorn.protocols" ^
    --hidden-import "uvicorn.protocols.http" ^
    --hidden-import "uvicorn.protocols.http.auto" ^
    --hidden-import "uvicorn.protocols.http.h11_impl" ^
    --hidden-import "uvicorn.protocols.websockets" ^
    --hidden-import "uvicorn.protocols.websockets.auto" ^
    --hidden-import "uvicorn.protocols.websockets.wsproto_impl" ^
    --hidden-import "uvicorn.lifespan" ^
    --hidden-import "uvicorn.lifespan.on" ^
    server.py

if errorlevel 1 (
    echo build_server.bat: the build failed. See the output above. 1>&2
    exit /b 1
)

if not exist "dist\essay-server.exe" (
    echo build_server.bat: the build finished but dist\essay-server.exe is missing. 1>&2
    exit /b 1
)

echo Built dist\essay-server.exe
endlocal
