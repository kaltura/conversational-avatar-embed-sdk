"""
Avatar Analysis Lambda Function

Shared Lambda serving the HR Avatar, Code Interview, and AT&T Seller Hub demos.
Analyzes call/session transcripts using AWS Bedrock (Claude) and returns
structured JSON summaries.

Analysis modes (selected by the `analysis_mode` request field):
  - "per_problem":       Analyze a single coding problem from a transcript (~5s, max_tokens=512)
  - "synthesis":         Synthesize per-problem results into an overall assessment (~8s, max_tokens=512)
  - "knowledge_check":   Analyze a product knowledge check session (~8s, max_tokens=1500)
  - "training_summary":  Generate a prose training session summary (~5s, max_tokens=500)
  - "call_summary_email": Alias for training_summary (Alon's original main-avatar post-call mode)
  - "general":           Structured sales training session report (~8s, max_tokens=1200)
  - "send_report_email": Email a formatted report to the user via SES
  - (default):           Full single-call HR analysis using HR_SYSTEM_PROMPT (v4.1 schema, max_tokens from env)

The Code Interview client fires N parallel per_problem calls then one synthesis call.
The HR Avatar client sends a single request with no analysis_mode (hits the default path).
The AT&T Seller Hub sends knowledge_check (for quizzes), general (for coaching sessions),
or send_report_email (fire-and-forget after report is shown).

Environment Variables:
    MODEL_ID:    Bedrock model ID (default: claude-3-haiku)
    MAX_TOKENS:  Max output tokens for default/full mode (default: 2048)
    TEMPERATURE: Model temperature (default: 0.3)
    SES_FROM_EMAIL: Verified SES sender address (default: noreply@avatardemo.att-sellerhub.com)
"""

import json
import os
import re
import html
import boto3
from botocore.config import Config

# =============================================================================
# CONFIGURATION
# =============================================================================

MODEL_ID = os.environ.get('MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0')
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '2048'))
TEMPERATURE = float(os.environ.get('TEMPERATURE', '0.3'))

bedrock_config = Config(
    retries={'max_attempts': 3, 'mode': 'adaptive'},
    read_timeout=60,
    connect_timeout=10
)

bedrock = boto3.client('bedrock-runtime', config=bedrock_config)

SES_FROM_EMAIL = os.environ.get('SES_FROM_EMAIL', 'noreply@avatardemo.att-sellerhub.com')
ses = boto3.client('ses')

# =============================================================================
# CORS HEADERS
# =============================================================================

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
}

# =============================================================================
# CODE INTERVIEW PROMPTS (per-problem + synthesis)
# =============================================================================

PER_PROBLEM_SYSTEM_PROMPT = """Analyze ONE coding problem from an interview transcript. Focus ONLY on the specified problem.
Output ONLY valid JSON. No markdown. Be concise — all strings 1 sentence max.

OUTPUT JSON SHAPE:
{"problem_id":"str","problem_title":"str","difficulty":"easy|medium|hard","outcome":"solved|partial|stuck|skipped","tests_passed":int,"tests_total":int,"approach":"brute_force|hash_map|two_pointer|sorting|dynamic_programming|recursion|greedy|other|incomplete","approach_used":"str","time_complexity":"str","space_complexity":"str","optimal":bool,"time_spent_minutes":int,"hints_used":int,"scores":{"creativity":1-5,"logic":1-5,"code_quality":1-5,"explainability":1-5,"complexity":1-5,"scale":1-5},"eval_notes":"1-2 sentences"}"""

SYNTHESIS_SYSTEM_PROMPT = """Synthesize coding interview results into overall assessment. Output ONLY valid JSON. Be VERY concise — max 5 words per string field. fit.score_0_100=skill(60%)+potential(40%).

JSON:
{"overview":"20-30 words","skill_assessment":{"problem_solving":1-5,"problem_solving_e":"str","code_fluency":1-5,"code_fluency_e":"str","communication":1-5,"communication_e":"str","efficiency_awareness":1-5,"efficiency_awareness_e":"str"},"potential_assessment":{"creativity_score":1-5,"creativity_a":"str","tenacity_score":1-5,"tenacity_a":"str","aptitude_score":1-5,"aptitude_a":"str","propensity_score":1-5,"propensity_a":"str","talent_indicators":["max3"],"potential_vs_performance":"potential_exceeds|matches|performance_exceeds|insufficient","growth_trajectory":"high|moderate|limited|unknown"},"fit":{"score_0_100":num,"rec":"strong_yes|yes|lean_yes|lean_no|no","conf":"high|medium|low","rationale":"str"},"strengths":["max3"],"areas_for_improvement":["max3"],"cq":{"emo":"calm|confident|neutral|frustrated|stressed|positive|unknown","tone":"collaborative|independent|receptive|defensive|unknown","eng":"high|medium|low|unknown","think_aloud":bool},"risk":{"flags":["none"],"escalated":false,"reason":""},"next_steps":["max2"]}"""

# =============================================================================
# HR DEMO SYSTEM PROMPT (default / full mode)
# =============================================================================

HR_SYSTEM_PROMPT = """You are an expert HR analyst. Analyze HR call transcripts and produce structured JSON summaries.

CRITICAL RULES:
1. Output ONLY valid JSON - no markdown, no explanations, no code blocks
2. Follow the schema EXACTLY
3. Be evidence-based and concise
4. Never reference internal terms like "DPP" in output text

REQUIRED OUTPUT STRUCTURE:
{
  "v": "4.1",
  "mode": "<interview|post_interview|separation>",
  "ctx": {"org":"str","role":"str","role_id":"str","loc":"str","person":"str","subj_id":"str"},
  "dpp_digest": {"mins":int,"focus":["str"],"must":["str"],"nice":["str"],"cv_provided":bool,"role_id":"str","subj_id":"str"},
  "turns": int,
  "overview": "80-200 word summary",
  "key_answers": [{"id":"str","q":"str","a":"str","status":"answered|partially_answered|not_answered","strength":"strong|ok|weak|unknown"}],
  "fit": {"score_0_100":num,"rec":"strong_yes|yes|lean_yes|lean_no|no","conf":"high|medium|low","dims":[{"id":"str","score_1_5":1-5,"e":"str"}]},
  "star_analysis": null,
  "believability": {"score_0_100":num,"cv_consistency":"consistent|mixed|inconsistent|no_cv|unknown","mismatches":[],"signals":["str"],"notes":"str"},
  "gaps": [{"missing":"str","why_matters":"str","next_q":"str"}],
  "cq": {"emo":"str","tone":"str","eng":"str"},
  "risk": {"flags":["none"],"escalated":false,"reason":""},
  "next_steps": ["str"]
}

Return ONLY the JSON object."""

# =============================================================================
# AT&T SELLER HUB PROMPTS (knowledge check + training summary)
# =============================================================================

KNOWLEDGE_CHECK_SYSTEM_PROMPT = """You are an AT&T sales training evaluator. Analyze a knowledge check session transcript and output ONLY a valid JSON object. No markdown, no explanation.

OUTPUT SCHEMA:
{
  "product": "<AT&T product assessed>",
  "overall_score": <0-100 integer>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
  "summary": "<2-3 sentence overview of the session>",
  "strong_spots": ["<up to 4 specific strengths observed>"],
  "weak_spots": ["<up to 4 specific gaps or mistakes>"],
  "areas_to_improve": ["<up to 4 concrete, actionable improvement items>"],
  "study_suggestions": [
    {"topic": "<topic name>", "why": "<why this matters for selling>", "priority": "<high|medium|low>"}
  ],
  "question_breakdown": [
    {"question_summary": "<short label>", "score": <1-5>, "quality": "<strong|adequate|weak>", "feedback": "<1 sentence>"}
  ],
  "readiness": "<ready_to_sell|needs_review|not_ready>"
}"""

TRAINING_SUMMARY_SYSTEM_PROMPT = """You are an AT&T Seller Hub AI assistant. You observed a conversation between an AT&T sales employee and an AI avatar trainer.

Write a concise, professional call summary. Include:
- A brief overview of what was discussed (2-3 sentences)
- Key topics that came up during the session
- Strengths you observed in how the employee handled the conversation
- Suggested next steps and specific areas to focus on

Output ONLY valid JSON with this structure:
{
  "summary_text": "<prose summary, max 250 words, no markdown>",
  "topics": ["<key topic 1>", "<key topic 2>"],
  "engagement": "<high|medium|low>"
}"""

GENERAL_ANALYSIS_SYSTEM_PROMPT = """You are an AT&T sales training evaluator. Analyze a sales training conversation and output ONLY a valid JSON object. No markdown, no explanation.

OUTPUT SCHEMA:
{
  "session_type": "<short label for the type of session based on the transcript>",
  "overall_score": <0-100 integer>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
  "summary": "<2-3 sentence overview of the session>",
  "strong_spots": ["<up to 4 specific strengths observed>"],
  "weak_spots": ["<up to 4 specific gaps or weaknesses>"],
  "areas_to_improve": ["<up to 4 concrete, actionable items>"],
  "study_suggestions": [
    {"topic": "<topic>", "why": "<why it matters>", "priority": "<high|medium|low>"}
  ],
  "engagement": "<high|medium|low>",
  "confidence": "<high|medium|low>"
}"""

# =============================================================================
# LAMBDA HANDLER
# =============================================================================

def lambda_handler(event, context):
    # Handle CORS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)

        mode = body.get('analysis_mode')

        if mode == 'per_problem':
            return handle_per_problem(body)
        elif mode == 'synthesis':
            return handle_synthesis(body)
        elif mode == 'knowledge_check':
            return handle_knowledge_check(body)
        elif mode in ('training_summary', 'call_summary_email'):
            return handle_training_summary(body)
        elif mode == 'general':
            return handle_general(body)
        elif mode == 'send_report_email':
            return handle_send_report_email(body)
        else:
            return handle_full(body)

    except json.JSONDecodeError as e:
        return error_response(f'Invalid JSON: {str(e)}', 'VALIDATION_ERROR')
    except bedrock.exceptions.ThrottlingException:
        return error_response('Service busy, please retry', 'THROTTLING', 429)
    except bedrock.exceptions.ModelTimeoutException:
        return error_response('Analysis took too long, please retry', 'TIMEOUT', 504)
    except Exception as e:
        print(f'Error: {str(e)}')
        return error_response(f'Analysis failed: {str(e)}', 'BEDROCK_ERROR', 500)


def handle_per_problem(body):
    """Analyze a single problem from the transcript."""
    transcript = body.get('transcript', [])
    problem = body.get('problem_focus', {})
    dpp = body.get('dpp', {})

    if not transcript:
        return error_response('Missing: transcript', 'VALIDATION_ERROR')
    if not problem.get('id'):
        return error_response('Missing: problem_focus.id', 'VALIDATION_ERROR')

    transcript_text = format_transcript(transcript)

    user_prompt = (
        f"Analyze ONLY the problem \"{problem.get('title', problem['id'])}\" "
        f"(id: {problem['id']}, difficulty: {problem.get('difficulty', '?')}).\n\n"
        f"## Session Context\n"
        f"Language: {dpp.get('live_code', dpp.get('session', {})).get('language', 'python') if isinstance(dpp.get('live_code'), dict) else 'python'}\n"
        f"Session problems: {json.dumps(dpp.get('all_problems_in_session', []), separators=(',', ':'))}\n\n"
        f"## Transcript\n{transcript_text}\n\n"
        f"Output the JSON for this ONE problem only."
    )

    result, usage = call_bedrock(user_prompt, PER_PROBLEM_SYSTEM_PROMPT, max_tokens=512)

    return success_response(result, usage)


def handle_synthesis(body):
    """Synthesize per-problem results into an overall assessment."""
    problem_results = body.get('problem_results', [])
    dpp = body.get('dpp', {})

    if not problem_results:
        return error_response('Missing: problem_results', 'VALIDATION_ERROR')

    candidate = dpp.get('candidate', {})
    name = candidate.get('full_name', candidate.get('first_name', 'Candidate'))
    elapsed = dpp.get('session', {}).get('elapsed_minutes', '?')
    total_problems = dpp.get('session', {}).get('total_problems', len(problem_results))

    user_prompt = (
        f"Candidate: {name}\n"
        f"Session: {elapsed} minutes, {len(problem_results)} of {total_problems} problems attempted.\n"
        f"Hints given: {dpp.get('session', {}).get('hints_given', 0)}\n\n"
        f"## Per-Problem Results\n"
        f"```json\n{json.dumps(problem_results, separators=(',', ':'))}\n```\n\n"
        f"Synthesize these results into one overall assessment JSON."
    )

    result, usage = call_bedrock(user_prompt, SYNTHESIS_SYSTEM_PROMPT, max_tokens=512)

    return success_response(result, usage)


def handle_full(body):
    """Full single-call analysis (HR demo or legacy code interview)."""
    transcript = body.get('transcript', [])
    dpp = body.get('dpp', {})
    schema = body.get('schema')
    custom_prompt = body.get('summary_prompt')

    if not transcript:
        return error_response('Missing: transcript', 'VALIDATION_ERROR')
    if not dpp:
        return error_response('Missing: dpp', 'VALIDATION_ERROR')

    user_prompt = build_full_prompt(transcript, dpp, schema, custom_prompt)
    summary, usage = call_bedrock(user_prompt, custom_prompt or HR_SYSTEM_PROMPT)

    # Inject final_code from DPP
    final_code = dpp.get('final_code') or dpp.get('live_code', {}).get('current_code', '')
    if final_code and 'final_code' not in summary:
        summary['final_code'] = final_code

    return success_response(summary, usage)


def handle_knowledge_check(body):
    """Analyze a product knowledge check session and produce a graded report."""
    transcript = body.get('transcript', [])
    product = body.get('product', 'AT&T Product')
    questions = body.get('questions', [])

    if not transcript:
        return error_response('Missing: transcript', 'VALIDATION_ERROR')

    q_block = '\n'.join(f'{i+1}. {q}' for i, q in enumerate(questions)) if questions else 'Not provided'
    user_prompt = (
        f"Product assessed: {product}\n\n"
        f"Questions asked during the session:\n{q_block}\n\n"
        f"## Transcript\n{format_transcript(transcript)}\n\n"
        f"Analyze this knowledge check and output the JSON report."
    )

    result, usage = call_bedrock(user_prompt, KNOWLEDGE_CHECK_SYSTEM_PROMPT, max_tokens=1500)
    return success_response(result, usage)


def handle_training_summary(body):
    """Generate a prose summary of a general training session."""
    transcript = body.get('transcript', [])

    if not transcript:
        return error_response('Missing: transcript', 'VALIDATION_ERROR')

    user_prompt = (
        f"## Transcript\n{format_transcript(transcript)}\n\n"
        f"Write the call summary and output the JSON."
    )

    result, usage = call_bedrock(user_prompt, TRAINING_SUMMARY_SYSTEM_PROMPT, max_tokens=500)
    return success_response(result, usage)


def handle_general(body):
    """Analyze a general sales training session and produce a structured report."""
    transcript = body.get('transcript', [])
    context = body.get('context', '')

    if not transcript:
        return error_response('Missing: transcript', 'VALIDATION_ERROR')

    user_prompt = (
        (f"Session context: {context}\n\n" if context else '') +
        f"## Transcript\n{format_transcript(transcript)}\n\n"
        f"Analyze this sales training session and output the JSON report."
    )

    result, usage = call_bedrock(user_prompt, GENERAL_ANALYSIS_SYSTEM_PROMPT, max_tokens=1200)
    return success_response(result, usage)


def handle_send_report_email(body):
    """Send a branded HTML report email to the user via SES."""
    to_email = body.get('to_email', '').strip()
    report = body.get('report', {})
    title = body.get('title', 'Session Report')

    if not to_email or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', to_email):
        return error_response('Missing or invalid to_email', 'VALIDATION_ERROR')
    if not report:
        return error_response('Missing report data', 'VALIDATION_ERROR')

    html_body = build_report_email_html(report, title)
    subject = f'AT&T Seller Hub — {title} Report'

    try:
        ses.send_email(
            Source=f'AT&T Seller Hub <{SES_FROM_EMAIL}>',
            Destination={'ToAddresses': [to_email]},
            Message={
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {
                    'Html': {'Data': html_body, 'Charset': 'UTF-8'}
                }
            }
        )
    except Exception as e:
        print(f'SES send error: {e}')
        return error_response(f'Email send failed: {str(e)}', 'SES_ERROR', 500)

    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps({'success': True, 'message': f'Report emailed to {to_email}'})
    }


def build_report_email_html(report, title):
    """Build an AT&T-branded HTML email from a report JSON object."""
    h = html.escape
    grade = h(str(report.get('grade', 'N/A')))
    score = int(report.get('overall_score', report.get('score', 0)) or 0)
    summary = h(str(report.get('summary', report.get('summary_text', ''))))
    product = h(str(report.get('product', report.get('session_type', title))))
    readiness = report.get('readiness', '')
    engagement = h(str(report.get('engagement', '')))
    confidence = h(str(report.get('confidence', '')))

    # Grade color mapping (AT&T brand)
    gc = '#666'
    if grade and grade[0] == 'A': gc = '#6EBB1F'
    elif grade and grade[0] == 'B': gc = '#067AB4'
    elif grade and grade[0] == 'C': gc = '#FF9900'
    elif grade and grade[0] == 'D': gc = '#FF7200'
    elif grade and grade[0] == 'F': gc = '#B30A3C'

    # Readiness badge
    readiness_map = {
        'ready_to_sell': ('&#10003; Ready to Sell', '#6EBB1F'),
        'needs_review': ('&#9888; Needs Review', '#FF9900'),
        'not_ready': ('&#10007; Not Ready', '#B30A3C')
    }
    readiness_label, readiness_color = readiness_map.get(readiness, ('', '#999'))

    def bullet_list(items, fallback='None noted'):
        if not items:
            return f'<li style="color:#999;">{fallback}</li>'
        out = []
        for item in items:
            if isinstance(item, dict):
                priority = h(str(item.get('priority', '')))
                topic = h(str(item.get('topic', '')))
                why = h(str(item.get('why', '')))
                badge_color = '#067AB4' if priority == 'high' else '#FF9900' if priority == 'medium' else '#999'
                out.append(
                    f'<li><span style="display:inline-block;padding:2px 8px;border-radius:10px;'
                    f'font-size:11px;background:{badge_color};color:#fff;margin-right:6px;">'
                    f'{priority}</span><strong>{topic}</strong> — {why}</li>'
                )
            else:
                out.append(f'<li>{h(str(item))}</li>')
        return '\n'.join(out)

    # Question breakdown rows
    q_rows = ''
    for i, q in enumerate(report.get('question_breakdown', []), 1):
        q_score = int(q.get('score', 0) or 0)
        stars = '\u2605' * q_score + '\u2606' * (5 - q_score)
        quality = str(q.get('quality', 'adequate'))
        q_color = '#6EBB1F' if quality == 'strong' else '#FF9900' if quality == 'adequate' else '#B30A3C'
        q_rows += f'''
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:bold;color:#0C2577;">Q{i}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;">{h(str(q.get('question_summary', '')))}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;color:{q_color};letter-spacing:2px;">{stars}</td>
        </tr>'''
        if q.get('feedback'):
            q_rows += f'''
        <tr>
            <td></td>
            <td colspan="2" style="padding:4px 12px 12px;font-size:13px;color:#666;font-style:italic;">
                {h(str(q['feedback']))}</td>
        </tr>'''

    # Metadata chips
    meta_chips = ''
    if engagement:
        meta_chips += (
            f'<span style="display:inline-block;padding:4px 12px;background:#f0f4f8;'
            f'border-radius:16px;font-size:12px;margin-right:8px;color:#333;">'
            f'Engagement: <strong>{engagement}</strong></span>'
        )
    if confidence:
        meta_chips += (
            f'<span style="display:inline-block;padding:4px 12px;background:#f0f4f8;'
            f'border-radius:16px;font-size:12px;color:#333;">'
            f'Confidence: <strong>{confidence}</strong></span>'
        )

    return f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Verdana,Geneva,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:#0C2577;padding:24px 32px;">
    <table width="100%"><tr>
        <td><img src="https://upload.wikimedia.org/wikipedia/commons/3/31/AT%26T_logo_2016.svg" alt="AT&T" height="28" style="vertical-align:middle;"></td>
        <td align="right" style="color:rgba(255,255,255,0.7);font-size:12px;">Seller Hub Report</td>
    </tr></table>
</td></tr>

<!-- Grade Hero -->
<tr><td style="padding:32px;text-align:center;border-bottom:1px solid #eee;">
    <div style="display:inline-block;width:100px;height:100px;border-radius:50%;border:4px solid {gc};text-align:center;line-height:1;">
        <div style="font-size:36px;font-weight:bold;color:{gc};margin-top:18px;">{grade}</div>
        <div style="font-size:14px;color:{gc};">{score}/100</div>
    </div>
    <div style="margin-top:16px;font-size:18px;font-weight:bold;color:#0C2577;">{product}</div>
    {f'<div style="margin-top:8px;"><span style="display:inline-block;padding:4px 14px;border-radius:16px;font-size:12px;font-weight:bold;background:{readiness_color};color:#fff;">{readiness_label}</span></div>' if readiness_label else ''}
    {f'<div style="margin-top:10px;">{meta_chips}</div>' if meta_chips else ''}
</td></tr>

<!-- Summary -->
{f"""<tr><td style="padding:24px 32px;">
    <p style="color:#333;font-size:14px;line-height:1.7;margin:0;">{summary}</p>
</td></tr>""" if summary else ''}

<!-- 2x2 Grid -->
<tr><td style="padding:0 24px;">
<table width="100%" cellpadding="0" cellspacing="8">
<tr>
<td width="50%" valign="top" style="background:#f0f9e8;border-radius:8px;padding:16px;">
    <div style="font-size:13px;font-weight:bold;color:#4a8c1c;margin-bottom:8px;">&#9989; Strong Spots</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.8;">
        {bullet_list(report.get('strong_spots'))}
    </ul>
</td>
<td width="50%" valign="top" style="background:#fff5f5;border-radius:8px;padding:16px;">
    <div style="font-size:13px;font-weight:bold;color:#B30A3C;margin-bottom:8px;">&#9888; Weak Spots</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.8;">
        {bullet_list(report.get('weak_spots'))}
    </ul>
</td>
</tr>
<tr>
<td width="50%" valign="top" style="background:#f0f4ff;border-radius:8px;padding:16px;">
    <div style="font-size:13px;font-weight:bold;color:#067AB4;margin-bottom:8px;">&#128200; Areas to Improve</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.8;">
        {bullet_list(report.get('areas_to_improve'))}
    </ul>
</td>
<td width="50%" valign="top" style="background:#fffbf0;border-radius:8px;padding:16px;">
    <div style="font-size:13px;font-weight:bold;color:#FF9900;margin-bottom:8px;">&#128218; Study Suggestions</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.8;">
        {bullet_list(report.get('study_suggestions'))}
    </ul>
</td>
</tr>
</table>
</td></tr>

<!-- Question Breakdown -->
{f"""<tr><td style="padding:24px 32px 8px;">
    <div style="font-size:15px;font-weight:bold;color:#0C2577;margin-bottom:12px;">Question Breakdown</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;">
        <tr style="background:#f4f6f8;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;"></th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Question</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Rating</th>
        </tr>
        {q_rows}
    </table>
</td></tr>""" if q_rows else ''}

<!-- Footer -->
<tr><td style="padding:24px 32px;background:#f4f6f8;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">
        This report was generated automatically by the AT&T Seller Hub AI training platform.<br>
        For questions, contact your training manager.
    </p>
</td></tr>

</table>
</td></tr></table>
</body></html>'''


# =============================================================================
# HELPERS
# =============================================================================

def build_full_prompt(transcript, dpp, schema=None, custom_prompt=None):
    transcript_text = format_transcript(transcript)
    turn_count = len([t for t in transcript if t.get('role') == 'user'])
    dpp_clean = {k: v for k, v in dpp.items() if k != 'summary_prompt'}

    parts = [
        "Analyze this session and produce a JSON summary.\n",
        f"## Session Mode\n{dpp_clean.get('mode', 'interview')}\n",
        f"## Turn Count\n{turn_count} user turns\n",
        f"## DPP\n```json\n{json.dumps(dpp_clean, separators=(',', ':'))}\n```\n",
        f"## Transcript\n{transcript_text}\n",
    ]

    if schema:
        parts.append(f"## Schema\n```json\n{json.dumps(schema, separators=(',', ':'))}\n```\n")

    parts.append(
        "\n## Instructions\n"
        "Follow the system prompt schema exactly.\n"
        "Output ONLY the JSON object, no other text."
    )

    return '\n'.join(parts)


def format_transcript(transcript):
    lines = []
    for i, turn in enumerate(transcript, 1):
        role = turn.get('role', 'unknown')
        content = turn.get('content', '')
        speaker = 'AI' if role == 'assistant' else 'Candidate'
        lines.append(f"[{i}] {speaker}: {content}")
    return '\n'.join(lines)


def call_bedrock(user_prompt, system_prompt, max_tokens=None):
    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens or MAX_TOKENS,
        "temperature": TEMPERATURE,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}]
    }

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps(request_body),
        contentType='application/json',
        accept='application/json'
    )

    response_body = json.loads(response['body'].read())
    content = response_body.get('content', [{}])[0].get('text', '{}').strip()

    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])

    try:
        summary = json.loads(content)
    except json.JSONDecodeError as e:
        print(f'Failed to parse LLM response: {content[:500]}')
        raise ValueError(f'LLM returned invalid JSON: {str(e)}')

    usage = {
        'input_tokens': response_body.get('usage', {}).get('input_tokens', 0),
        'output_tokens': response_body.get('usage', {}).get('output_tokens', 0)
    }

    return summary, usage


def success_response(data, usage):
    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps({'success': True, 'summary': data, 'usage': usage})
    }


def error_response(message, code, status_code=400):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({'success': False, 'error': message, 'code': code})
    }
