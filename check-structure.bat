@echo off
echo ========================================
echo Quick Fix for Cloud Functions Upload
echo ========================================
echo.

echo [Step 1] Check and move pages folder...
if exist "pages" (
    echo Found pages folder in root, moving...
    move pages miniprogram\pages
    echo Done.
) else if exist "miniprogram\pages" (
    echo pages folder already in miniprogram.
) else (
    echo WARNING: pages folder not found!
)
echo.

echo [Step 2] Check and move utils folder...
if exist "utils" (
    echo Found utils folder in root, moving...
    move utils miniprogram\utils
    echo Done.
) else if exist "miniprogram\utils" (
    echo utils folder already in miniprogram.
) else (
    echo WARNING: utils folder not found!
)
echo.

echo [Step 3] Check and move styles folder...
if exist "styles" (
    echo Found styles folder in root, moving...
    move styles miniprogram\styles
    echo Done.
) else if exist "miniprogram\styles" (
    echo styles folder already in miniprogram.
) else (
    echo styles folder not found, skipping.
)
echo.

echo [Step 4] Check cloud functions...
if exist "cloudfunctions" (
    echo cloudfunctions folder exists.
    echo Cloud functions found:
    dir /b cloudfunctions
) else (
    echo ERROR: cloudfunctions folder not found!
)
echo.

echo [Step 5] Check project.config.json...
if exist "project.config.json" (
    echo project.config.json exists.
) else (
    echo ERROR: project.config.json not found!
)
echo.

echo [Step 6] Check package.json...
if exist "package.json" (
    echo package.json exists.
) else (
    echo ERROR: package.json not found!
)
echo.

echo ========================================
echo Directory check complete!
echo ========================================
echo.
echo Next steps:
echo 1. Close WeChat Developer Tools
echo 2. Open the project again
echo 3. Click "Cloud Development" button
echo 4. Create or select a cloud environment
echo 5. Copy the environment ID
echo 6. Update miniprogram/app.js with your env ID
echo 7. Right-click cloud function and select upload
echo.
pause
