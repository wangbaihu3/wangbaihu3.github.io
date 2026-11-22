@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ======================================================
echo TXT 文件夹递归索引更新（先将TXT文件放进 TXT 文件夹）
echo ======================================================
where node >nul 2>nul
if not errorlevel 1 (
  node "tools\重建TXT全文索引.cjs"
  if errorlevel 1 goto fail
  node "tools\生成网站文件校验.cjs"
  if errorlevel 1 goto fail
  echo 已更新目录、全文快速检索索引和网站校验清单。
  goto end
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "tools\重建TXT目录_无需Node.py"
  if errorlevel 1 goto fail
  py -3 "tools\生成网站文件校验.py"
  if errorlevel 1 goto fail
  echo 已更新TXT目录。未安装Node时，全文搜索需要逐篇检查，速度较慢。
  goto end
)
where python >nul 2>nul
if not errorlevel 1 (
  python "tools\重建TXT目录_无需Node.py"
  if errorlevel 1 goto fail
  python "tools\生成网站文件校验.py"
  if errorlevel 1 goto fail
  goto end
)
echo 当前电脑未安装Node或Python。可使用网站的本机文件夹选择功能，无需索引。
echo 要发布到网页，请让服务管理员运行 tools 内索引脚本。
goto end
:fail
echo 索引更新失败，请检查提示与TXT文件名和编码。
:end
pause
