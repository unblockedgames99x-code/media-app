$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'OS input QA is restricted to isolated GitHub-hosted Windows runners.'
}
Add-Type -Path (Join-Path $PSScriptRoot 'windows-input-test.cs')
$taskDriver = $null
try {
    while ($null -ne ($taskLine = [Console]::In.ReadLine())) {
        $taskRequest = ConvertFrom-Json $taskLine
        try {
            switch ($taskRequest.action) {
                'begin' {
                    if ($null -ne $taskDriver) { throw 'The OS input driver was already initialized.' }
                    $taskDriver = [MediaWindowsInputTest]::new([long]$taskRequest.hostWindow, [long]$taskRequest.childWindow, [uint32]$taskRequest.hostProcess, [uint32]$taskRequest.engineProcess)
                    $taskBefore = $taskDriver.Snapshot()
                    $taskResult = @{ before = $taskBefore; afterActivation = $taskDriver.Activate() }
                }
                'click' { $taskResult = $taskDriver.Click([double]$taskRequest.horizontal, [double]$taskRequest.vertical) }
                'close' { $taskResult = @{ closed = $true } }
                default { $taskResult = $taskDriver.Run([string]$taskRequest.action) }
            }
            [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ id = $taskRequest.id; result = $taskResult } -Depth 10 -Compress))
        } catch {
            [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ id = $taskRequest.id; error = $_.Exception.GetBaseException().Message } -Compress))
            break
        }
        if ($taskRequest.action -eq 'close') { break }
    }
} finally {
    if ($null -ne $taskDriver) { $taskDriver.Dispose() }
}
