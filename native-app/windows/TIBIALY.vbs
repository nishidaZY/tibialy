' TIBIALY launcher: starts the local server in WSL if needed, then opens it in its own Edge window.
' The Desktop shortcut passes the WSL distro and the repo path (see install.ps1).
' The distro must stay unquoted: wsl.exe does not find it otherwise (distro names have no spaces).
Option Explicit

Const APP_URL = "http://localhost:3000"
Const MAX_TRIES = 60

Dim shell, startCmd, tries
Set shell = CreateObject("WScript.Shell")
startCmd = "wsl.exe -d " & WScript.Arguments(0) & " --exec bash -l """ & _
           WScript.Arguments(1) & "/native-app/windows/start_server.sh"""

Function IsUp()
  IsUp = (shell.Run("curl.exe -s -f -m 2 -o NUL " & APP_URL & "/up", 0, True) = 0)
End Function

If Not IsUp() Then
  shell.Run startCmd, 0, False   ' hidden, and left running after this script ends
  tries = 0
  Do While Not IsUp()
    tries = tries + 1
    If tries >= MAX_TRIES Then
      MsgBox "TIBIALY's server did not start." & vbCrLf & vbCrLf & _
             "See log/launcher.log in the project folder, inside WSL.", vbExclamation, "TIBIALY"
      WScript.Quit 1
    End If
    WScript.Sleep 1000
  Loop
End If

shell.Run "cmd /c start """" msedge --app=" & APP_URL, 0, False
