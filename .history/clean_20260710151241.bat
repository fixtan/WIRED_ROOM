@echo off
cd /d "%~dp0"
echo 現在のフォルダおよびサブフォルダ内の *.Zone.Identifier を一括削除します...
del /s /f *.Zone.Identifier
echo 削除が完了しました。
pause
