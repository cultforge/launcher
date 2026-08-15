; CultForge NSIS installer hooks
; Docs: https://v2.tauri.app/distribute/windows-installer/#extending-the-installer
;
; Default install (currentUser): $LOCALAPPDATA\CultForge
;
; Edit the macros below or the PowerShell scripts under src-tauri/installer-scripts/

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "CultForge pre-install (Java 17 + cleanup)"
  ; Prefer override next to the setup .exe
  ; Use "$INSTDIR\." so a trailing \ does not escape the closing quote.
  IfFileExists "$EXEDIR\pre-install.ps1" 0 cultforge_pre_extract
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$EXEDIR\pre-install.ps1" "$INSTDIR\."'
    Goto cultforge_pre_done
  cultforge_pre_extract:
  ; Compile-time embed of installer-scripts\pre-install.ps1 (runs before files hit $INSTDIR)
  ; __FILEDIR__ is the NSIS staging dir (…/target/release/nsis/x64) when makensis expands this macro.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=cultforge-pre-install.ps1" "${__FILEDIR__}\..\..\installer-scripts\pre-install.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cultforge-pre-install.ps1" "$INSTDIR\."'
  cultforge_pre_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "CultForge post-install → $INSTDIR"
  IfFileExists "$INSTDIR\installer-scripts\post-install.ps1" 0 cultforge_post_skip
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer-scripts\post-install.ps1" "$INSTDIR\."'
    Goto cultforge_post_done
  cultforge_post_skip:
    DetailPrint "Missing installer-scripts\post-install.ps1"
  cultforge_post_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "CultForge pre-uninstall"
  IfFileExists "$INSTDIR\installer-scripts\pre-uninstall.ps1" 0 +2
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer-scripts\pre-uninstall.ps1" "$INSTDIR\."'
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "CultForge post-uninstall"
!macroend
