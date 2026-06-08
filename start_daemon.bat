@echo off
cd /d H:\bibelraum
echo Server wird gestartet...
start /B node server.js > server.log 2>&1
echo Server gestartet! Offne http://localhost:3000
echo.
echo Zum Beenden: taskkill /f /im node.exe
