@echo off
REM Copy the Python backend server exe into src-tauri\binaries as a Tauri 2 sidecar.
REM
REM A Tauri sidecar must be named <name>-<target-triple>[.exe], where <name> is the
REM entry listed under bundle.externalBin in tauri.conf.json. Our entry is
REM "binaries/essay-server" and the host triple is x86_64-pc-windows-msvc
REM (from `rustc -vV`), so the destination is
REM   essay-ui\src-tauri\binaries\essay-server-x86_64-pc-windows-msvc.exe
REM This script cd's into scripts\, so the paths below are relative to that.
REM
REM NOTE ON THE SOURCE: the real PyInstaller server currently lives at
REM backend\dist\gessay-server.exe (the name carries a typo). backend\dist\
REM essay-server.exe is NOT the server - it is a small unrelated
REM Delphi/C++Builder binary. If you rebuild the server with
REM backend\build_server.bat it writes dist\essay-server.exe; pass that path as
REM the first argument instead.
setlocal enableextensions
cd /d "%~dp0"

set "SRC=%~1"
if "%SRC%"=="" set "SRC=..\..\backend\dist\gessay-server.exe"
set "DST=..\src-tauri\binaries\essay-server-x86_64-pc-windows-msvc.exe"

if not exist "%SRC%" (
    echo copy-server.bat: the server exe was not found at "%SRC%". 1>&2
    echo It looks like the backend has not been built yet. 1>&2
    echo Build it first with backend\build_server.bat, then re-run this script, 1>&2
    echo or pass the path of an already built exe: 1>&2
    echo     scripts\copy-server.bat ^<full path to the server exe^> 1>&2
    exit /b 1
)

if not exist "..\src-tauri\binaries" mkdir "..\src-tauri\binaries"

REM The source carries Hidden+System attributes, which makes cmd's plain `copy`
REM fail with "The system cannot find the file specified", so use xcopy /H.
REM (No /K: the sidecar itself should come out as a normal visible file.)
echo F | xcopy /H /Y "%SRC%" "%DST%" >nul
if errorlevel 1 (
    echo copy-server.bat: copying "%SRC%" to "%DST%" failed. 1>&2
    exit /b 1
)

REM The source is Hidden+System, which xcopy reproduces on the destination;
REM the sidecar should be an ordinary visible file.
attrib -H -S "%DST%"

for %%I in ("%SRC%") do set "SIZE=%%~zI"
echo Copied "%SRC%" (%SIZE% bytes) to "%DST%".
endlocal
