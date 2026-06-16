# System Architecture & Visual Flow - scraper-mcp

This document provides a visual representation of how the **scraper-mcp** server operates, detailing the communication flow, tool executions, and fallback handlers.

---

## 1. High-Level System Architecture

The following diagram shows the end-to-end data flow when Claude interacts with the MCP Server via SSE transport.

```mermaid
graph TD
    subgraph Claude Client
        Claude[Claude App / Desktop] <-->|JSON-RPC over HTTP/SSE| MCP_Client[MCP Client]
    end

    subgraph scraper-mcp Server (Railway)
        Express[Express App]
        SSE_Route[GET /sse <br> Establish stream]
        Msg_Route[POST /messages <br> Handle requests]
        McpServer[McpServer SDK Router]
        UserLogger[(user_footprints.jsonl)]
    end

    subgraph External APIs
        ScraperAPI[ScraperAPI REST API]
        NvidiaNIM[NVIDIA NIM Chat API]
    end

    %% Client Handshake
    MCP_Client -->|GET /sse| SSE_Route
    SSE_Route -.->|Establishes SSE Session| MCP_Client
    SSE_Route -->|Log session_connect| UserLogger

    %% Message Loop
    MCP_Client -->|POST /messages| Msg_Route
    Msg_Route -->|Log user footprint / tool_call| UserLogger
    Msg_Route -->|Forward JSON-RPC payload| McpServer

    %% Server Tool Logic
    McpServer -->|1. Request Scrape| ScraperAPI
    McpServer -->|2. Request Enrichment| NvidiaNIM

    %% Backoffs & Fallbacks
    ScraperAPI -.->|If fails: Direct Fetch| TargetWeb[Target Website]
    NvidiaNIM -.->|If fails: Fallback regex parser| LocalFallback[Local Regex / Tag Metadata Extractor]
```

---

## 2. Tool Execution Lifecycle: `scrape_and_enrich`

Below is the execution flow detailing the robust exponential backoffs and local fallback extractors in case of API outages.

```mermaid
flowchart TD
    Start([Start scrape_and_enrich]) --> CallScraper[Request ScraperAPI]
    
    %% ScraperAPI Attempt
    CallScraper --> CheckScraper{Succeeded?}
    CheckScraper -- Yes --> CleanHTML[Clean HTML with Cheerio]
    
    CheckScraper -- No: 429 or 5xx --> RetryBackoff{Attempts < 3?}
    RetryBackoff -- Yes --> SleepBackoff[Wait: exponential time 1.5s, 3s, 6s] --> CallScraper
    RetryBackoff -- No --> DirectFetch[Attempt Direct HTTP Fetch]
    
    DirectFetch --> CheckDirect{Succeeded?}
    CheckDirect -- Yes --> CleanHTML
    CheckDirect -- No --> ScraperError[Return Scraping Error result] --> End([End Tool Call])

    %% Enrichment Attempt
    CleanHTML --> TruncateText[Truncate text to 6000 chars]
    TruncateText --> CallNIM[Request NVIDIA NIM Chat Completions]
    
    CallNIM --> CheckNIM{Succeeded & Valid JSON?}
    CheckNIM -- Yes --> ReturnSuccess[Return Enriched JSON Data] --> End
    
    CheckNIM -- No --> ExtractLocal[Run Cheerio & Regex Metadata Extractor]
    ExtractLocal --> ReturnFallback[Return Local Metadata + raw_text + enrichment_error] --> End
```

---

## 3. Tool Execution Lifecycle: `scrape_batch`

Below is the visual flow of the concurrent batch processing queue.

```mermaid
flowchart TD
    Start([Start scrape_batch]) --> CheckConcurrency{Is Concurrency > 1?}
    
    %% Sequential branch
    CheckConcurrency -- No (Sequential) --> LoopSeq[For each URL]
    LoopSeq --> WaitDelay[Delay ms] --> ProcessURL[Process URL Scrape + NIM]
    ProcessURL --> CheckLoop{More URLs?}
    CheckLoop -- Yes --> LoopSeq
    CheckLoop -- No --> AggregateResult[Compile aggregated results]
    
    %% Parallel branch
    CheckConcurrency -- Yes (Parallel Pool) --> SpinWorkers[Launch Concurrent Workers max 5]
    SpinWorkers --> WorkerQueue[Workers pull next URL from shared queue]
    WorkerQueue --> ProcessParallel[Process URL concurrently]
    ProcessParallel --> QueueEmpty{Shared Queue Empty?}
    QueueEmpty -- No --> WorkerQueue
    QueueEmpty -- Yes --> AggregateResult
    
    AggregateResult --> ReturnResults[Return aggregated array of outputs] --> End([End Tool Call])
```

---

## 4. How the Logging Footprint Works

Every network interaction is logged asynchronously (without blocking request execution) to preserve performance under concurrent load.

```mermaid
sequenceDiagram
    participant Client
    participant Express as Express Server
    participant Logger as User Logger
    participant File as footprints.jsonl

    Client->>Express: GET /sse (Initiate connection)
    Note over Express: Generate unique Session ID
    Express-)Logger: Trigger session_connect log
    activate Logger
    Logger->>File: Write Client IP, User-Agent, Session ID (Async)
    deactivate Logger
    Express-->>Client: Establishes event stream

    Client->>Express: POST /messages (Call tool: scrape_and_enrich)
    Note over Express: Intercept payload: method = tools/call
    Express-)Logger: Trigger tool_call log
    activate Logger
    Logger->>File: Write session_id, toolName, prompt, target url (Async)
    deactivate Logger
    Express-->>Client: Returns JSON-RPC Tool Result
```
