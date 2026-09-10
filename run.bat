@echo off
rem ============================================================================
rem  AI & Intelligent Systems curriculum - Windows launcher
rem
rem  Double-click for a menu, or name a target from a shell:
rem
rem      run.bat validate        all three checks, in the order CI runs them
rem      run.bat content         structure, catalog and README figures
rem      run.bat mermaid         parse every diagram
rem      run.bat lint            markdown style
rem      run.bat regen           rewrite derived files from data\catalog.json
rem      run.bat new-leaf        guided scaffold for a new leaf
rem      run.bat install         reinstall dependencies from the lockfile
rem      run.bat status          branch, working tree and catalog totals
rem      run.bat help            usage, including unattended scheduling
rem
rem  The exit code is 0 only when every step passed, so this is safe to use
rem  unattended as a scheduled task or a build step.
rem ============================================================================

setlocal EnableExtensions EnableDelayedExpansion

rem Work from the repository root no matter where the shell started.
pushd "%~dp0" || (
    echo [ERROR] Could not enter the script directory: %~dp0
    exit /b 1
)

rem No argument means a person double-clicked this: show the menu and hold the
rem window open. With an argument, stay quiet and scriptable.
set "INTERACTIVE="
if "%~1"=="" set "INTERACTIVE=1"

call :check_toolchain
if errorlevel 1 goto :fail

if defined INTERACTIVE goto :menu

call :dispatch "%~1"
goto :done

rem ---------------------------------------------------------------------------
:menu
cls
echo ===========================================================================
echo   AI ^& Intelligent Systems - curriculum toolchain
echo ===========================================================================
call :print_context
echo.
echo   [1] Validate everything        content + mermaid + markdown lint
echo   [2] Validate content only
echo   [3] Validate mermaid diagrams
echo   [4] Lint markdown
echo   [5] Regenerate derived files
echo   [6] Create a new leaf, guided
echo   [7] Reinstall dependencies
echo   [8] Repository status
echo   [9] Help
echo   [0] Exit
echo.
set "CHOICE="
set /p "CHOICE=Select: "

if "!CHOICE!"=="0" goto :done
if "!CHOICE!"=="1" ( call :dispatch validate & goto :menu_pause )
if "!CHOICE!"=="2" ( call :dispatch content  & goto :menu_pause )
if "!CHOICE!"=="3" ( call :dispatch mermaid  & goto :menu_pause )
if "!CHOICE!"=="4" ( call :dispatch lint     & goto :menu_pause )
if "!CHOICE!"=="5" ( call :dispatch regen    & goto :menu_pause )
if "!CHOICE!"=="6" ( call :dispatch new-leaf & goto :menu_pause )
if "!CHOICE!"=="7" ( call :dispatch install  & goto :menu_pause )
if "!CHOICE!"=="8" ( call :dispatch status   & goto :menu_pause )
if "!CHOICE!"=="9" ( call :dispatch help     & goto :menu_pause )
echo.
echo   Not a valid choice.

:menu_pause
echo.
pause
goto :menu

rem ---------------------------------------------------------------------------
:dispatch
set "WHAT=%~1"
if /i "!WHAT!"=="validate"  goto :t_validate
if /i "!WHAT!"=="content"   goto :t_content
if /i "!WHAT!"=="mermaid"   goto :t_mermaid
if /i "!WHAT!"=="lint"      goto :t_lint
if /i "!WHAT!"=="regen"     goto :t_regen
if /i "!WHAT!"=="new-leaf"  goto :t_new_leaf
if /i "!WHAT!"=="newleaf"   goto :t_new_leaf
if /i "!WHAT!"=="install"   goto :t_install
if /i "!WHAT!"=="status"    goto :t_status
if /i "!WHAT!"=="help"      goto :t_help
if /i "!WHAT!"=="-h"        goto :t_help
if /i "!WHAT!"=="--help"    goto :t_help
if /i "!WHAT!"=="/?"        goto :t_help
echo [ERROR] Unknown target "!WHAT!". Run "run.bat help" for the list.
exit /b 2

:t_validate
call :ensure_deps
if errorlevel 1 exit /b 1
call :run_step "Validating structure, catalog and README figures" validate:content
if errorlevel 1 exit /b 1
call :run_step "Parsing every mermaid diagram" validate:mermaid
if errorlevel 1 exit /b 1
call :run_step "Linting markdown" lint:md
if errorlevel 1 exit /b 1
echo.
echo [OK] All checks passed. This is exactly what CI runs.
exit /b 0

:t_content
call :ensure_deps
if errorlevel 1 exit /b 1
call :run_step "Validating structure, catalog and README figures" validate:content
exit /b !ERRORLEVEL!

:t_mermaid
call :ensure_deps
if errorlevel 1 exit /b 1
call :run_step "Parsing every mermaid diagram" validate:mermaid
exit /b !ERRORLEVEL!

:t_lint
call :ensure_deps
if errorlevel 1 exit /b 1
call :run_step "Linting markdown" lint:md
exit /b !ERRORLEVEL!

:t_regen
call :ensure_deps
if errorlevel 1 exit /b 1
echo.
echo Rewriting CATALOG.md, the README figures and every tree and branch README
echo from data\catalog.json. Derived files are never edited by hand.
echo.
call npm run regen
if errorlevel 1 exit /b 1
echo.
echo [OK] Derived files rewritten. Review the diff, then validate.
exit /b 0

:t_install
echo.
echo Installing dependencies from package-lock.json.
echo.
call npm ci
if errorlevel 1 (
    echo.
    echo [ERROR] npm ci failed. If the lockfile disagrees with package.json,
    echo         run "npm install" once and commit the updated lockfile.
    exit /b 1
)
echo.
echo [OK] Dependencies installed.
exit /b 0

:t_status
echo.
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do echo   Branch       : %%b
for /f "delims=" %%c in ('git rev-parse --short HEAD 2^>nul') do echo   Commit       : %%c
set "DIRTY=clean"
for /f "delims=" %%s in ('git status --porcelain 2^>nul') do set "DIRTY=uncommitted changes"
echo   Working tree : !DIRTY!
call :print_catalog_totals
echo.
exit /b 0

rem ---------------------------------------------------------------------------
:t_new_leaf
call :ensure_deps
if errorlevel 1 exit /b 1
echo.
echo A leaf is scaffolded rather than written from scratch: the generator adds
echo the catalog entry and regenerates all navigation, so the derived files
echo cannot drift. Every TODO marker it leaves must be replaced before the
echo content validator will pass.
echo.

set "LEAF_ID="
set /p "LEAF_ID=Leaf id, lowercase and hyphenated (e.g. ai-pii-redaction): "
if "!LEAF_ID!"=="" (
    echo [ERROR] A leaf id is required.
    exit /b 2
)

set "LEAF_TITLE="
set /p "LEAF_TITLE=Title: "
if "!LEAF_TITLE!"=="" (
    echo [ERROR] A title is required.
    exit /b 2
)
set LEAF_TITLE=!LEAF_TITLE:"=!

echo.
echo Levels:
echo   [1] Beginner
echo   [2] Intermediate
echo   [3] Advanced
echo   [4] Enterprise
echo   [5] Expert
set "SEL="
set /p "SEL=Level number: "
set "LEAF_LEVEL="
if "!SEL!"=="1" set "LEAF_LEVEL=Beginner"
if "!SEL!"=="2" set "LEAF_LEVEL=Intermediate"
if "!SEL!"=="3" set "LEAF_LEVEL=Advanced"
if "!SEL!"=="4" set "LEAF_LEVEL=Enterprise"
if "!SEL!"=="5" set "LEAF_LEVEL=Expert"
if "!LEAF_LEVEL!"=="" (
    echo [ERROR] Not a valid level.
    exit /b 2
)

echo.
echo Trees:
set "N=0"
for /f "usebackq delims=" %%t in (`node -e "var c=require('./data/catalog.json');var s=[];c.leaves.forEach(function(l){if(s.indexOf(l.tree)===-1){s.push(l.tree)}});s.forEach(function(t){console.log(t)})"`) do (
    set /a N+=1
    set "OPT_!N!=%%t"
    set "LINE=%%t"
    echo   [!N!] !LINE!
)
if "!N!"=="0" (
    echo [ERROR] Could not read the tree list from data\catalog.json.
    exit /b 1
)
set "SEL="
set /p "SEL=Tree number: "
set "LEAF_TREE="
call set "LEAF_TREE=%%OPT_!SEL!%%"
if "!LEAF_TREE!"=="" (
    echo [ERROR] Not a valid tree number.
    exit /b 2
)

echo.
echo Branches in !LEAF_TREE!:
set "PICK_TREE=!LEAF_TREE!"
set "N=0"
for /f "usebackq delims=" %%b in (`node -e "var c=require('./data/catalog.json');var t=process.env.PICK_TREE;var s=[];c.leaves.forEach(function(l){if(l.tree===t){if(s.indexOf(l.branch)===-1){s.push(l.branch)}}});s.forEach(function(b){console.log(b)})"`) do (
    set /a N+=1
    set "BOPT_!N!=%%b"
    set "LINE=%%b"
    echo   [!N!] !LINE!
)
if "!N!"=="0" (
    echo [ERROR] No branches found for that tree.
    exit /b 1
)
set "SEL="
set /p "SEL=Branch number: "
set "LEAF_BRANCH="
call set "LEAF_BRANCH=%%BOPT_!SEL!%%"
if "!LEAF_BRANCH!"=="" (
    echo [ERROR] Not a valid branch number.
    exit /b 2
)

echo.
echo   id     : !LEAF_ID!
echo   title  : !LEAF_TITLE!
echo   level  : !LEAF_LEVEL!
echo   tree   : !LEAF_TREE!
echo   branch : !LEAF_BRANCH!
echo.
set "CONFIRM="
set /p "CONFIRM=Scaffold this leaf and rewrite the derived files? [y/N] "
if /i not "!CONFIRM!"=="y" (
    echo Cancelled. Nothing was written.
    exit /b 0
)

echo.
call npm run new-leaf -- --id "!LEAF_ID!" --title "!LEAF_TITLE!" --level "!LEAF_LEVEL!" --tree "!LEAF_TREE!" --branch "!LEAF_BRANCH!"
if errorlevel 1 (
    echo.
    echo [ERROR] Scaffolding failed and nothing was written.
    exit /b 1
)
echo.
echo [OK] Leaf scaffolded. Replace every TODO marker, then run "run.bat validate".
exit /b 0

rem ---------------------------------------------------------------------------
:t_help
echo.
echo   run.bat [target]
echo.
echo     validate    content + mermaid + markdown lint, in the order CI runs them
echo     content     heading hierarchy, required sections, frontmatter and catalog
echo                 agreement, unresolved TODOs, links, README figures
echo     mermaid     parse every diagram headlessly
echo     lint        markdown style
echo     regen       rewrite derived files from data\catalog.json
echo     new-leaf    guided scaffold for a new leaf
echo     install     reinstall dependencies from the lockfile
echo     status      branch, working tree and catalog totals
echo     help        this text
echo.
echo   Run with no target for an interactive menu.
echo.
echo   Unattended use. The exit code is 0 only when every step passes, so this
echo   works as a scheduled task. To validate the checkout each weekday morning,
echo   from an elevated prompt, on one line:
echo.
echo     schtasks /create /tn "Curriculum validate" /sc weekly /d MON,TUE,WED,THU,FRI /st 09:00 /tr "'%~f0' validate"
echo.
echo   Replace the single quotes above with double quotes. Remove it again with:
echo.
echo     schtasks /delete /tn "Curriculum validate" /f
echo.
exit /b 0

rem ---------------------------------------------------------------------------
:run_step
echo.
echo --- %~1
call npm run %~2
if errorlevel 1 (
    echo.
    echo [FAILED] %~1
    exit /b 1
)
exit /b 0

rem ---------------------------------------------------------------------------
:check_toolchain
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not on PATH.
    echo         Install the current LTS from https://nodejs.org, then open a new
    echo         terminal so the updated PATH is picked up. CI builds on Node 22.
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not on PATH even though node is. Reinstall Node.js with
    echo         the official installer rather than copying the binary.
    exit /b 1
)

set "NODE_MAJOR="
for /f "tokens=1 delims=." %%v in ('node --version 2^>nul') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=!NODE_MAJOR:v=!"
if not defined NODE_MAJOR (
    echo [ERROR] Could not read a version from "node --version".
    exit /b 1
)
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Node !NODE_MAJOR! is too old. The tooling is ESM and the mermaid
    echo         parser needs a current runtime. Install Node 22.
    exit /b 1
)
if not "!NODE_MAJOR!"=="22" (
    echo [WARN]  Running Node !NODE_MAJOR!; CI runs Node 22. Checks that pass here
    echo         can still fail there. Match the version before pushing.
    echo.
)
exit /b 0

rem ---------------------------------------------------------------------------
:ensure_deps
if exist "node_modules\.package-lock.json" exit /b 0
echo.
echo Dependencies are not installed yet. Installing from the lockfile once.
echo.
call npm ci
if errorlevel 1 (
    echo.
    echo [ERROR] npm ci failed. Check network and proxy settings, then retry.
    echo         Nothing else will run until this succeeds.
    exit /b 1
)
exit /b 0

rem ---------------------------------------------------------------------------
:print_context
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do echo   Branch: %%b
call :print_catalog_totals
exit /b 0

:print_catalog_totals
if not exist "data\catalog.json" exit /b 0
for /f "usebackq delims=" %%t in (`node -e "var c=require('./data/catalog.json');var l=c.leaves;var t=[];var b=[];l.forEach(function(x){if(t.indexOf(x.tree)===-1){t.push(x.tree)}if(b.indexOf(x.branch)===-1){b.push(x.branch)}});console.log('  Catalog: '+l.length+' leaves, '+t.length+' trees, '+b.length+' branches')"`) do (
    set "LINE=%%t"
    echo !LINE!
)
exit /b 0

rem ---------------------------------------------------------------------------
:fail
popd
if defined INTERACTIVE pause
endlocal
exit /b 1

:done
set "RC=!ERRORLEVEL!"
popd
if defined INTERACTIVE pause
endlocal & exit /b %RC%
