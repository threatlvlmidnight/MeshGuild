@echo off
echo MeshGuild Environment Setup
echo ============================
echo.

set SUPABASE_URL=https://oxsesryubeolaclexlvv.supabase.co

echo Paste your Supabase SERVICE ROLE key (from Project Settings > API):
set /p SERVICE_KEY="> "
echo.
echo Paste your Supabase ANON key (from Project Settings > API):
set /p ANON_KEY="> "
echo.

(
echo MQTT_HOST=localhost
echo MQTT_PORT=1883
echo MQTT_TOPIC=msh/US/2/json/#
echo SUPABASE_URL=%SUPABASE_URL%
echo SUPABASE_SERVICE_KEY=%SERVICE_KEY%
echo SUPABASE_ANON_KEY=%ANON_KEY%
echo NETWORK_ID=okc-crew
) > c:\dev\meshtastic\collector\.env

echo.
echo Written to collector\.env
echo Done!
pause
