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
        Incomplete
    }

    class PatternMatch {
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

        finalize() {
            this.complete = true;
        }

        apply() {
            this.parent.apply(this);
        }

    }

    /**
     * Define a really general Pattern class that we'll use for our incremental DOM matching procedure
     *
     *  I currently don't actually support anything _other_ than open_ended but that'll come some day
     */
    class Pattern {
        matcher: (this: Pattern, node: Element | Node, match: PatternMatch) => PatternMatchResponse;
        match: PatternMatch;
        compounds: boolean;
        priority: number;
        open_ended: boolean;
        transform: (match: PatternMatch) => void;

        constructor(
            matcher: (this: any, node: Element | Node) => PatternMatchResponse,
            {
                priority = 0,
                compounds = true,
                open_ended = true,
                manage_match = true,
                transform = null
            } = {}
        ) {
            this.matcher = matcher.bind(this);
            this.priority = priority;
            this.compounds = compounds;
            this.open_ended = open_ended;
            this.match = manage_match ? new PatternMatch(this) : null;
            this.transform = transform;
        }

        disable_handling() {
            this.match = null;
        }

        push(node: Element | Node) {
            if (this.match !== null) {
                this.match.push(node);
            }
        }

        matches(node: Element | Node): PatternMatchResponse {
            const matched = this.matcher(node, this.match);
            if (matched == PatternMatchResponse.Matching || matched == PatternMatchResponse.Incomplete) {
                this.push(node);
            }
            return matched;
        }

        reset(): PatternMatch {
            const match = this.match;
            if (this.match !== null) {
                this.match = new PatternMatch(this)
            }
            return match;
        }

        apply(match: PatternMatch = null) {
            if (this.transform !== null ) {
                this.transform((match === null) ? this.match: match);
            }
        }

    }

    // Define a set of pattern functions that we can use

    // Set up patterns that operate on a field of an object
    class SimplePattern extends Pattern {
        field_options: Array<string>;
        field_name: string;

        constructor(field_options: Array<string>, field_name: string,
                    {
                        priority = 0,
                        compounds = false,
                        open_ended = false,
                        manage_match = true,
                        transform = null
                    } = {}
        ) {
            super(
                (el) => SimplePattern.match_field(el, this.field_name, this.field_options),
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match,
                    transform: transform
                }
            );
            this.field_options = field_options;
            this.field_name = field_name;
        }

        static match_field(element: Element | Node, field_name: string, field_options: Array<string>): PatternMatchResponse {
            const cname = element[field_name];
            let response = PatternMatchResponse.Matching;
            for (const c of field_options) {
                if (cname.indexOf(c) === -1) {
                    response = PatternMatchResponse.NonMatching;
                    break;
                }
            }

            return response;
        }
    }

    class TagPattern extends SimplePattern {
        constructor(tags: Array<string>,
                    {
                        priority = 0,
                        compounds = false,
                        open_ended = false,
                        manage_match = true
                    } = {}
        ) {
            super(tags, 'tagName',
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match
                }
            );
        }
    }
    class ClassPattern extends SimplePattern {
        constructor(classes: Array<string>,
                    {
                        priority = 0,
                        compounds = false,
                        open_ended = false,
                        manage_match = true,
                        transform = null
                    } = {}
        ) {
            super(classes, 'className',
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match,
                    transform: transform
                }
            );
        }
    }

    /**
     * A SequencePattern provides support for matching a sequence of objects
     *
     */
    class SequencePattern extends Pattern {
        cur: number;
        cur_counts: number;
        patterns: Array<Pattern>;
        repeats: Array<Array<number>>;

        constructor(patterns: Array<Pattern>, repeats: Array<Array<number>> = null,
                    {
                        priority = 1,
                        compounds = false,
                        open_ended = false,
                        manage_match = true,
                        transform = null
                    } = {}
        ) {
            super(
                (el) => this.match_seq(el),
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match,
                    transform: transform
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

        match_seq(element: Element | Node): PatternMatchResponse {
            const pattern = this.patterns[this.cur];
            let resp = pattern.matches(element);

            // we use these to determine whether a NonMatching means to progress to the next pattern or not
            // and to figure out if it's time to roll over to the next one
            const count = this.cur_counts;
            const min_count = this.repeats[this.cur][0];
            const max_count = this.repeats[this.cur][-1];

            // NonMatching either means the pattern just doesn't match or that we need to check against the next element
            // in the sequence
            if (resp === PatternMatchResponse.NonMatching && count >= min_count) {
                // this means it's time to roll over to the next pattern in the sequence
                this.inc_pattern();
                resp = this.match_seq(element);
            } else if (resp === PatternMatchResponse.Matching) {
                // if we haven't matched enough elements we just bump this up and return an Incomplete
                if (count < min_count) {
                    this.cur_counts++;
                    resp = PatternMatchResponse.Incomplete;
                } else if (max_count > 0 && count >= max_count) {
                    this.inc_pattern();
                }
            }

            return resp;
        }
    }

    /**
     * Provides an Intersection over the patterns, only matching if _all_ of them match
     */
    class AllPattern extends Pattern {
        patterns: Array<Pattern>;

        constructor(patterns: Array<Pattern>, repeats: Array<Array<number>> = null,
                    {
                        priority = 1,
                        compounds = false,
                        open_ended = false,
                        manage_match = true,
                        transform = null
                    } = {}
        ) {
            super(
                (el) => this.match_all(el),
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match,
                    transform: transform
                }
            );
            this.patterns = patterns;
            for (const pat of patterns) {
                pat.disable_handling();
                // _all_ of them must match so there's no reason for any single pattern to hold
                // the match
            }
        }

        match_all(element: Element | Node): PatternMatchResponse {
            let resp = PatternMatchResponse.Matching;
            for (const pat of this.patterns) {
                resp = pat.matches(element);
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
    class AnyPattern extends Pattern {
        patterns: Array<Pattern>;

        constructor(patterns: Array<Pattern>, repeats: Array<Array<number>> = null,
                    {
                        priority = 1,
                        compounds = false,
                        open_ended = false,
                        transform = null
                    } = {}
        ) {
            super(
                (el) => this.match_any(el),
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: false, // the subpatterns will manage all of the matches for real
                    transform: transform
                }
            );
            this.patterns = patterns;
            this.match = new PatternMatch(this, this.patterns.map(t=>t.match));
        }

        reset(): PatternMatch {
            const m = this.match;
            for (const pat of this.patterns) { pat.reset(); }
            this.match = new PatternMatch(this, this.patterns.map(t=>t.match));
            return m;
        }

        match_any(element: Element | Node): PatternMatchResponse {
            let resp = PatternMatchResponse.Matching;
            for (const pat of this.patterns) {
                resp = pat.matches(element);
                if (resp !== PatternMatchResponse.NonMatching) {
                    break
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
    class Annotator {
        patterns: Array<Pattern>;

        constructor(patterns: Pattern[]) {
            this.patterns = patterns;
        }

        _match_node(node: Element, matches: Set<PatternMatch>) {
            for (let j = 0; j < this.patterns.length; j++) {
                // we iterate like this so as to be able to discard any matches following the current one
                // if it turns out we have a non-compounding pattern
                const pat = this.patterns[j];
                const resp = pat.matches(node);
                switch (resp) {
                    case PatternMatchResponse.NonMatching:
                        // continue on to the next pattern, discarding any built-up state
                        pat.reset();
                        break;
                    case PatternMatchResponse.Incomplete:
                        // do nothing since the following patterns might still be relevant
                        // but make sure to put the match in matches in case we need to discard any
                        // _following_ matches if it turns out it matches in the end
                        matches.add(pat.match);
                        break;
                    case PatternMatchResponse.Matching:
                        // here we have to check a) if the pattern is compounding (i.e. if multiple can apply)
                        //  --> this should be the default case unless there's some compelling reason why it can't
                        //  work like that
                        // then we should apply it
                        const match = pat.match;
                        matches.add(match);
                        if (!pat.compounds) {
                            // gotta drop all following state, kill any following matches, etc.
                            const match_list = Array.from(matches.values());
                            const match_ind = match_list.indexOf(match);
                            for (let kill = match_ind + 1; kill < match_list.length; kill++) {
                                const kill_match = match_list[kill];
                                matches.delete(kill_match);
                            }
                        }
                        break;
                }
            }
        }

        _apply_rec(root: Element, matches: Set<PatternMatch>) {

            const nodes = root.children;
            const node_count = nodes.length;
            for (let i = 0; i < node_count; i++) {
                const node = nodes[i];
                this._match_node(node, matches);
                this._apply_rec(node, matches);
            }
        }

        apply(root: Element) {
            // we gotta walk the DOM, trying out different patterns and building our set of matches to work with
            // the basic algorithm will be to try out all of our different patterns one-by-one

            // We're gonna do this in a DFS type way, but given that we don't expect much-to-any nesting of our
            // node structure since it's coming from Markdown there's nothing really to worry about

            let matches = new Set<PatternMatch>();
            this._apply_rec(root, matches); // this populates 'matches'

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