/**
 * AnnotateMD:
 *   Provides annotations for MarkDown-based websites. Allows patterns like:
 *       <p...>...</p>
 *       <img>...</img>
 *  to be containerized like:
 *       <div class="sample-image>
 *           <p.../>
 *           <img.../>
 *       </div>
 *  or whatever of that nature
 */


namespace AnnotateMD {

    enum PatternMatchResponse {
        Matching,
        NonMatching,
        Incomplete,
        Completed, // this is a subtley different case than Matching, where we matched in a prior step
        Break, // this is a subtle case where you return a flag that basically says: stop matching on this object
        Unapplied // means for one reason or another the pattern chose not to apply itself
    }

    export class PatternMatch {
        nodes: Array<Element | Node | PatternMatch>;
        complete: boolean;
        parent: Pattern;

        constructor(parent: Pattern, nodes: Array<Element | Node | PatternMatch> = []) {
            this.parent = parent;
            this.nodes = nodes;
            this.complete = false;
        }

        get unfinished(): boolean {
            return this.nodes.length > 0 && this.complete == false;
        }

        push(node: Element | Node | PatternMatch) {
            this.nodes.push(node);
        }

        static _fillNodeList(match: PatternMatch, fill_to: (Element | Node)[], recurse: boolean): void {
            for (const node of match.nodes) {
                if (node instanceof PatternMatch) {
                    if (recurse) {
                        PatternMatch._fillNodeList(node, fill_to, recurse);
                    }
                } else {
                    fill_to.push(node);
                }
            }
        }

        getNodeList({recurse = true}): (Element | Node)[] {
            let node_list = [];
            PatternMatch._fillNodeList(this, node_list, recurse);
            return node_list;
        }

        finalize() {
            this.complete = true;
        }

        slice(start: number, end: number): PatternMatch  {
            let new_match = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
            new_match.nodes = new_match.nodes.slice(start, end);
            return new_match
        }

        apply() {
            this.parent.apply(this);
        }

    }

    const $DefaultDepth = 0;
    const $DefaultPriority = 0;
    const $DefaultAbsDepth = -1;
    const $DefaultApplications = -1;


    /**
     * Define a really general Pattern class that we'll use for our incremental DOM matching procedure
     *
     *  I currently don't actually support anything _other_ than open_ended but that'll come some day
     */
    export class Pattern {
        matcher: (node: Element | Node, match: PatternMatch, depth: number) => PatternMatchResponse; // the match method
        match: PatternMatch; // the matched data
        compounds: boolean; // whether the pattern should allow other patterns to stack on top of it
        terminal: boolean; // whether any subsequent matching should be done on the pattern -- basically a subcase of depth?
        priority: number; // the priority of the pattern -- currently unused, may always be that way
        depth: number; // the degree of nesting this pattern can apply to (usually like one level?)
        _cur_depth: number; // the current depth the pattern is matching at
        absolute_depth: number; // the amount of nesting this pattern is willing to support
        open_ended: boolean; // whether the pattern must be closed or not -- currently unused, may always be that way
        transform: (match: PatternMatch) => void; // the transform used by the pattern on its data
        applications: number; // the number of matches supported
        _applied: number; // the number of times the pattern has already applied

        constructor(
            matcher: (node: Element | Node, match: PatternMatch, depth: number) => PatternMatchResponse,
            {
                priority = $DefaultPriority,
                compounds = true,
                terminal = false,
                open_ended = true,
                depth = $DefaultDepth,
                absolute_depth = $DefaultAbsDepth,
                manage_match = true,
                transform = null,
                applications = $DefaultApplications
            } = {}
        ) {
            this.matcher = matcher;
            this.priority = priority;
            this.compounds = compounds;
            this.terminal = terminal;
            this.open_ended = open_ended;
            this.depth = depth;
            this.absolute_depth = absolute_depth;
            this.match = manage_match ? new PatternMatch(this) : null;
            this.transform = transform;
            this.applications = applications;
            this._cur_depth = -1;
            this._applied = 0;
        }

        disable_handling() {
            this.match = null;
        }

        push(node: Element | Node) {
            if (this.match !== null) {
                this.match.push(node);
            }
        }

        matches(node: Element | Node, depth: number): PatternMatchResponse {

            // a few quick short-circuit cases for when that's applicable
            if (this.absolute_depth >= 0 && this.absolute_depth < depth) {
                return PatternMatchResponse.Unapplied;
            }
            if (this.applications >= 0 && this.applications <= this._applied) {
                return PatternMatchResponse.Unapplied;
            }
            // console.log(["???", depth, this._cur_depth, this.depth]);
            if (this._cur_depth >= 0 && this.depth >= 0 && depth - this._cur_depth > this.depth) {
                return PatternMatchResponse.Unapplied;
            }

            const matched = this.matcher(node, this.match, depth);
            if (matched == PatternMatchResponse.Matching || matched == PatternMatchResponse.Incomplete) {
                if (this._cur_depth === -1) { this._cur_depth = depth; }
                if (matched == PatternMatchResponse.Matching) { this._applied += 1; }
                this.push(node);
            }
            return matched;
        }

        reset(): PatternMatch {
            const match = this.match;
            this._cur_depth = -1;
            if (this.match !== null) {
                this.match = new PatternMatch(this)
            }
            return match;
        }

        apply(match: PatternMatch = null) {
            if (this.transform !== null) {
                this.transform((match === null) ? this.match : match);
            }
        }

    }

    // Define a set of pattern functions that we can use

    // Set up patterns that operate on a field of an object
    export class SimplePattern extends Pattern {
        field_options: Array<string>;
        field_name: string;
        exact: boolean;
        all: boolean;

        constructor(field_options: Array<string>,
                    field_name: string,
                    {
                        priority = $DefaultPriority,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                        transform = null,
                        applications = $DefaultApplications,
                        exact = false,
                        all = false
                    } = {}
        ) {
            super(
                (el, match, depth) => (
                    SimplePattern.match_field(el, this.field_name, this.field_options, this.exact, this.all, match, depth)
                ),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications
                }
            );
            this.field_options = field_options;
            this.field_name = field_name;
            this.exact = exact;
            this.all = all;
        }

        static match_field(element: Element | Node,
                           field_name: string,
                           field_options: Array<string>,
                           exact: boolean,
                           all: boolean,
                           match: PatternMatch,
                           depth: number
        ): PatternMatchResponse {
            const cname = element[field_name];
            let response = PatternMatchResponse.Matching;
            if (!all) {
                response = PatternMatchResponse.NonMatching;
                for (const c of field_options) {
                    if (!exact) {
                        if (cname.indexOf(c) !== -1) {
                            response = PatternMatchResponse.Matching;
                            break;
                        }
                    } else {
                        if (cname === c) {
                            response = PatternMatchResponse.Matching;
                            break;
                        }
                    }
                }
            } else {
                for (const c of field_options) {
                    if (!exact) {
                        if (cname.indexOf(c) === -1) {
                            response = PatternMatchResponse.NonMatching;
                            break;
                        }
                    } else {
                        if (cname !== c) {
                            response = PatternMatchResponse.NonMatching;
                            break;
                        }
                    }
                }
            }

            return response;
        }
    }

    export class TagPattern extends SimplePattern {
        constructor(tags: Array<string>,
                    {
                        priority = $DefaultPriority,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                transform = null,
                applications = $DefaultApplications,
                        exact = true,
                        all = false
                    } = {}
        ) {
            super(tags.map(t => t.toUpperCase()), 'tagName',
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications,
                    exact: exact,
                    all: all
                }
            );
        }
    }

    export class ClassPattern extends SimplePattern {
        constructor(classes: Array<string>,
                    {
                        priority = $DefaultPriority,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                transform = null,
                applications = $DefaultApplications,
                        exact = false,
                        all = true
                    } = {}
        ) {
            super(classes, 'className',
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications,
                    exact: exact,
                    all: all
                }
            );
        }
    }

    /**
     * A SequencePattern provides support for matching a sequence of objects
     *
     */
    export class SequencePattern extends Pattern {
        cur: number;
        cur_counts: number;
        patterns: Array<Pattern>;
        repeats: Array<Array<number>>;

        constructor(patterns: Array<Pattern>, repeats: Array<Array<number>> = null,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => this.match_seq(el, match, depth),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications
                }
            );
            this.patterns = patterns;
            for (const pat of patterns) {
                pat.disable_handling();
            }
            this.repeats = (repeats === null) ? patterns.map((el, i) => [1]) : repeats;
            this.cur = 0;
            this.cur_counts = 0;
        }

        inc_pattern() {
            this.cur++;
            this.cur_counts = 0;
        }

        reset(): PatternMatch {
            this.cur = 0;
            this.cur_counts = 0;
            return super.reset();
        }

        exhausted(): boolean {
            return this.cur >= this.patterns.length;
        }

        match_seq(
            element: Element | Node,
            match: PatternMatch,
            depth: number
        ): PatternMatchResponse {
            // console.log(">>>>");
            // console.log(this.cur);

            const pattern = this.patterns[this.cur];
            let resp = pattern.matches(element, depth);

            // we use these to determine whether a NonMatching means to progress to the next pattern or not
            // and to figure out if it's time to roll over to the next one
            const min_count = this.repeats[this.cur][0];
            const max_count = this.repeats[this.cur][this.repeats[this.cur].length - 1];
            // console.log([max_count, depth]);

            // NonMatching either means the pattern just doesn't match or that we need to check against the next element
            // in the sequence
            if (resp === PatternMatchResponse.NonMatching && this.cur_counts >= min_count) {
                // this means it's time to roll over to the next pattern in the sequence
                this.inc_pattern();
                // now we have to check if the _entire_ thing is exhausted (if it is we have to return Matching so we can reset)
                if (this.exhausted()) {
                    resp = PatternMatchResponse.Completed;
                } else {
                    resp = this.match_seq(element, match, depth);
                }

            } else if (resp === PatternMatchResponse.Matching || resp === PatternMatchResponse.Completed) {
                // if we haven't matched enough elements we just bump cur_counts up and return an Incomplete
                resp = PatternMatchResponse.Incomplete;
                this.cur_counts++;

                // if we have matched enough, we increment the pattern
                if (max_count > 0 && this.cur_counts >= max_count) {
                    this.inc_pattern();
                }

                // now we have to check if the _entire_ thing is exhausted (if it is we have to return Matching so we can reset)
                if (this.exhausted()) {
                    resp = PatternMatchResponse.Matching;
                }
            }

            // console.log(element.tagName);
            // console.log(resp);
            // console.log("<<<<");
            return resp;
        }
    }

    /**
     * IgnoredPattern tells the pattern matcher not to continue to recurse down this channel
     */
    export class IgnoredPattern extends Pattern {
        pattern: Pattern;

        constructor(pattern: Pattern,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = true,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => (IgnoredPattern.match_ignore(el, this.pattern)),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications
                }
            );
            this.pattern = pattern;
            pattern.disable_handling();
        }

        static match_ignore(el, pattern) {
            let resp = pattern.matches(el);
            switch (resp) {
                case PatternMatchResponse.Incomplete:
                case PatternMatchResponse.Break:
                case PatternMatchResponse.Matching:
                    resp = PatternMatchResponse.Break;
                    break;
            }

            return resp;
        }
    }


    /**
     * Provides an Intersection over the patterns, only matching if _all_ of them match
     */
    export class AllPattern extends Pattern {
        patterns: Array<Pattern>;

        constructor(patterns: Array<Pattern>,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                        depth = $DefaultDepth,
                        absolute_depth = $DefaultAbsDepth,
                        manage_match = true,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => this.match_all(el, match, depth),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    depth: depth,
                    absolute_depth: absolute_depth,
                    manage_match: manage_match,
                    transform: transform,
                    applications: applications
                }
            );
            this.patterns = patterns;
            for (const pat of patterns) {
                pat.disable_handling();
                // _all_ of them must match so there's no reason for any single pattern to hold
                // the match
            }
        }

        match_all(element: Element | Node, match: PatternMatch, depth: number): PatternMatchResponse {
            let resp = PatternMatchResponse.Matching;
            for (const pat of this.patterns) {
                resp = pat.matches(element, depth);
                if (resp !== PatternMatchResponse.Matching) {
                    break
                }
            }

            return resp;
        }
    }

    /**
     * Provides a Union over the patterns, matching the first option
     */
    export class AnyPattern extends Pattern {
        patterns: Array<Pattern>;

        constructor(patterns: Array<Pattern>,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => this.match_any(el, match, depth),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    manage_match: false, // the subpatterns will manage all of the matches for real
                    transform: transform,
                    applications: applications
                }
            );
            this.patterns = patterns;
            this.match = new PatternMatch(this, this.patterns.map(t => t.match));
        }

        reset(): PatternMatch {
            const m = this.match;
            for (const pat of this.patterns) {
                pat.reset();
            }
            this.match = new PatternMatch(this, this.patterns.map(t => t.match));
            return m;
        }

        match_any(element: Element | Node, match: PatternMatch, depth: number): PatternMatchResponse {
            let resp = PatternMatchResponse.Matching;
            for (const pat of this.patterns) {
                resp = pat.matches(element, depth);
                if (resp !== PatternMatchResponse.NonMatching && resp !== PatternMatchResponse.Unapplied) {
                    break
                }
            }

            return resp;
        }
    }

    /**
     * Provides a Negation over the patterns
     */
    export class ExceptPattern extends Pattern {
        musnt_match: Pattern;
        must_match: Pattern;

        constructor(pattern: Pattern | Array<Pattern>,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => this.match_execpt(el, this.musnt_match, this.must_match, match, depth),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    manage_match: false, // the subpatterns will manage all of the matches for real
                    transform: transform,
                    applications: applications
                }
            );
            this.musnt_match = ((pattern instanceof Pattern) ? pattern : pattern[0]);
            this.musnt_match.disable_handling();
            this.must_match = ((pattern instanceof Pattern) ? null : pattern[1]);
            if (this.must_match instanceof Pattern) {

            }
        }

        match_execpt(element: Element | Node,
                     musnt: Pattern,
                     must: Pattern,
                     match: PatternMatch,
                     depth: number
                     ): PatternMatchResponse {
            let resp = musnt.matches(element, depth);
            if (resp === PatternMatchResponse.Matching || resp === PatternMatchResponse.Completed) {
                resp = PatternMatchResponse.NonMatching;
            } else if (resp === PatternMatchResponse.NonMatching) {
                resp = PatternMatchResponse.Matching;
            }

            return resp;
        }
    }

    export class PatternTest extends Pattern {
        must_match: Pattern;
        test: (element: Element | Node ) => boolean;

        constructor(pattern: Pattern, test: (element: Element | Node ) => boolean,
                    {
                        priority = 1,
                        compounds = true,
                        terminal = false,
                        open_ended = false,
                transform = null,
                applications = $DefaultApplications
                    } = {}
        ) {
            super(
                (el, match, depth) => this.match_test(el, this.must_match, this.test, match, depth),
                {
                    priority: priority,
                    compounds: compounds,
                    terminal: terminal,
                    open_ended: open_ended,
                    manage_match: false, // the subpatterns will manage all of the matches for real
                    transform: transform,
                    applications: applications
                }
            );
            this.must_match = ((pattern instanceof Pattern) ? null : pattern[1]);
            if (this.must_match instanceof Pattern) { this.must_match.disable_handling() };
            this.test = test;
        }

        match_test(element: Element | Node,
                     must: Pattern,
                     test: (element: Element | Node ) => boolean,
                     match: PatternMatch,
                     depth: number
                     ): PatternMatchResponse {
            let resp = must.matches(element, depth);
            if (resp === PatternMatchResponse.Matching || resp === PatternMatchResponse.Completed) {
                let subresp = test(element);
                if (!subresp) {
                    resp = PatternMatchResponse.NonMatching;
                }
            }
            return resp;
        }
    }

    /**
     * Define an Annotator object that we can apply to the entire DOM and which can find and annotate the appropriate
     * Markdown blocks
     *
     */

    class HandleMatchResponse {
        resp: PatternMatchResponse;
        break_flag: boolean;

        constructor(resp: PatternMatchResponse, break_flag: boolean) {
            this.resp = resp;
            this.break_flag = break_flag;
        }
    }

    export class Annotator {
        patterns: Array<Pattern>;

        constructor(patterns: Pattern[]) {
            this.patterns = patterns;
        }

        _handle_match(
            core_response: PatternMatchResponse,
            pat: Pattern,
            matches: Set<PatternMatch>,
            match: PatternMatch
        ): HandleMatchResponse {
            let resp = core_response;
            let break_flag = false;
            switch (resp) {
                case PatternMatchResponse.NonMatching:
                    // continue on to the next pattern, discarding any built-up state
                    pat.reset();
                    matches.delete(match);
                    break;
                case PatternMatchResponse.Incomplete:
                    // do nothing since the following patterns might still be relevant
                    // but make sure to put the match in matches in case we need to discard any
                    // _following_ matches if it turns out it matches in the end
                    matches.add(match);
                    break;
                case PatternMatchResponse.Completed:
                case PatternMatchResponse.Matching:
                    // here we have to check a) if the pattern is compounding (i.e. if multiple can apply)
                    //  --> this should be the default case unless there's some compelling reason why it can't
                    //  work like that
                    // then we should apply it
                    matches.add(match);
                    if (!pat.compounds) {
                        // gotta drop all following state, kill any following matches, etc.
                        const match_list = Array.from(matches.values());
                        const match_ind = match_list.indexOf(match);
                        for (let kill = match_ind + 1; kill < match_list.length; kill++) {
                            const kill_match = match_list[kill];
                            kill_match.parent.reset();
                            matches.delete(kill_match);
                        }
                        break_flag = true;
                    }
                    if (pat.terminal) {
                        resp = PatternMatchResponse.Break;
                        break_flag = true;
                    }
                    pat.reset();
                    break;

                case PatternMatchResponse.Break:
                    break_flag = true;
                    break;
            }

            return new HandleMatchResponse(resp, break_flag);
        }

        _match_node(node: Element, matches: Set<PatternMatch>, depth: number): PatternMatchResponse {
            let resp = PatternMatchResponse.Matching;
            let break_flag = false;
            for (let j = 0; j < this.patterns.length; j++) {
                // we iterate like this so as to be able to discard any matches following the current one
                // if it turns out we have a non-compounding pattern
                const pat = this.patterns[j];
                resp = pat.matches(node, depth);
                let handle_resp = this._handle_match(resp, pat, matches, pat.match);
                break_flag = handle_resp.break_flag;
                if (handle_resp.resp === PatternMatchResponse.Completed) {
                    // this means we actually need to apply this pattern to the node again :|
                    // this is because we basically did a look-ahead, found that our pattern doesn't match
                    // so we handled the match that we'd been building up, but now we need to go back and see if this
                    // new thing matches
                    resp = pat.matches(node, depth);
                    handle_resp = this._handle_match(resp, pat, matches, pat.match);
                    break_flag = break_flag || handle_resp.break_flag; // need to update this now...
                }
                if (break_flag) {
                    break;
                }
            }

            return resp;
        }

        _apply_rec(root: Element, matches: Set<PatternMatch>, max_depth: number, cur_depth: number) {

            const nodes = root.children;
            const node_count = nodes.length;
            if (max_depth <= 0 || cur_depth <= max_depth) {
                for (let i = 0; i < node_count; i++) {
                    const node = nodes[i];
                    const resp = this._match_node(node, matches, cur_depth);
                    if (resp !== PatternMatchResponse.Break) {
                        this._apply_rec(node, matches, max_depth, cur_depth + 1);
                    }
                }
            }
        }

        apply(root: Element, max_depth: number = -1) {
            // we gotta walk the DOM, trying out different patterns and building our set of matches to work with
            // the basic algorithm will be to try out all of our different patterns one-by-one

            // We're gonna do this in a DFS type way, but given that we don't expect much-to-any nesting of our
            // node structure since it's coming from Markdown there's nothing really to worry about

            let matches = new Set<PatternMatch>();
            this._apply_rec(root, matches, max_depth, 0); // this populates 'matches'

            // now we go through and apply all of them
            const match_iter = matches.values();
            let match = match_iter.next();
            while (!match.done) {
                match.value.apply();
                match = match_iter.next();
            }
        }

    }

}

