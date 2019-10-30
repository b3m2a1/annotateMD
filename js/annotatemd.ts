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
        nodes: Array<HTMLElement | ChildNode | PatternMatch>;
        complete: boolean;
        parent: Pattern;

        constructor(parent: Pattern, nodes: Array<HTMLElement | ChildNode | PatternMatch> = []) {
            this.parent = parent;
            this.nodes = nodes;
            this.complete = false;
        }

        get unfinished(): boolean {
            return this.nodes.length > 0 && this.complete == false;
        }

        push(node: HTMLElement | ChildNode | PatternMatch) {
            this.nodes.push(node);
        }

        finalize() {
            this.complete = true;
        }

    }

    /**
     * Define a really general Pattern class that we'll use for our incremental DOM matching procedure
     *
     */
    class Pattern {
        matcher: (this: Pattern, node: HTMLElement | ChildNode, match: PatternMatch) => PatternMatchResponse;
        match: PatternMatch;
        compounds: boolean;
        priority: number;
        open_ended: boolean;
        transform: (match: PatternMatch) => void;

        constructor(
            matcher: (this: any, node: HTMLElement | ChildNode) => PatternMatchResponse,
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

        push(node: HTMLElement | ChildNode) {
            if (this.match !== null) {
                this.match.push(node);
            }
        }

        matches(node: HTMLElement | ChildNode): PatternMatchResponse {
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

        static match_field(element: HTMLElement | ChildNode, field_name: string, field_options: Array<string>): PatternMatchResponse {
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

        match_seq(element: HTMLElement | ChildNode): PatternMatchResponse {
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

        match_all(element: HTMLElement | ChildNode): PatternMatchResponse {
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
                        open_ended = false
                    } = {}
        ) {
            super(
                (el) => this.match_any(el),
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: false // the subpatterns will manage all of the matches
                }
            );
            this.patterns = patterns;
            this.match = new PatternMatch(this.patterns.map(t=>t.match));
        }

        reset(): PatternMatch {
            const m = this.match;
            for (const pat of this.patterns) {
                pat.reset();
            }
            this.match = new PatternMatch(this.patterns.map(t=>t.match));
            return m;
        }

        match_any(element: HTMLElement | ChildNode): PatternMatchResponse {
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

        apply(root: HTMLElement) {
            // we gotta walk the DOM, trying out different patterns and building our set of matches to work with
            // the basic algorithm will be to try out all of our different patterns one-by-one

            // We're gonna do this in a DFS type way, but given that we don't expect much-to-any nesting of our
            // node structure since it's coming from Markdown there's nothing really to worry about

            const nodes = root.children;
            const node_count = nodes.length;
            const num_pats = this.patterns.length;
            let matches = new Set<PatternMatch>();
            for ( let i = 0; i < node_count; i++ ) {
                const node = nodes[i];
                for ( let j = 0; j < node_count; j++ ) {
                    // we iterate like this so as to
                    const pat = this.patterns[j];
                    const resp = pat.matches(node);
                    switch (resp) {
                        case PatternMatchResponse.NonMatching:
                            // continue on to the next pattern, discarding any built-up state
                            pat.reset();
                            break;
                        case PatternMatchResponse.Incomplete:
                            // do nothing since the following patterns might still be relevant
                            // but make sure to put the match in matches in case we need to discard any _following_ matches
                            break;
                        case PatternMatchResponse.Matching:
                            // here we have to check a) if the pattern is compounding (i.e. if multiple can apply)
                            //  --> this should be the default case unless there's some compelling reason why it can't
                            //  work like that
                            // then we should apply it


                    }
                }
            }

        }

    }

}