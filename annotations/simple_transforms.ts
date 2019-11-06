/// <reference path="../annotatemd.ts" />

namespace AnnotateMD.Annotations {


    // We'll define a bunch of annotations helpers that will make it possible to do _common_ types of annotations
    // on our system
    export function ClassAdder(addClass: string): ((match: PatternMatch) => void) {

        function add_classes(match: PatternMatch) {
            match.nodes.forEach(m => add_class(m));
        }
        function add_class(match: PatternMatch | Element | Node) {
            if (match instanceof PatternMatch) {
                add_classes(match)
            } else if (match instanceof Element) {
                match.classList.add(addClass);
            } else if (match.nodeType === Node.ELEMENT_NODE) {
                add_class(match as Element);
            }
        }

        return add_classes;
    }

    export function IDSetter(addID: string): ((match: PatternMatch) => void) {

        function add_ids(match: PatternMatch) {
            match.nodes.forEach(m => add_id(m));
        }
        function add_id(match: PatternMatch | Element | Node) {
            if (match instanceof PatternMatch) {
                add_ids(match)
            } else if (match instanceof Element) {
                match.id = addID;
            } else if (match.nodeType === Node.ELEMENT_NODE) {
                add_id(match as Element);
            }
        }

        return add_id;
    }

    export function SectionMaker(
        {
            section_class = null as string | string[],
            header_class = null as string | string[],
            body_class = null as string | string[],
            collapsible = true,
            collapsed = false
        } = {}
    ): ((match: PatternMatch) => void) {
        // set up something that will make a Section out of the data,
        // setting it up to be collapsible (if specified) or collapsed (if specified)

        function make_groups(match: PatternMatch) {

            const nodes = match.getNodeList({recurse: false});
            const first_node = nodes[0];
            const parent = first_node.parentNode;
            const section_node = document.createElement("div");
            if (typeof section_class === "string") {
                section_node.classList.add(section_class);
            } else if (section_class !== null) {
                section_class.forEach(c => section_node.classList.add(c))
            }
            const head_node = document.createElement("div");
            if (typeof header_class === "string") {
                head_node.classList.add(header_class);
            } else if (header_class !== null) {
                header_class.forEach(c => head_node.classList.add(c))
            }
            const body_node = document.createElement("div");
            if (typeof body_class === "string") {
                body_node.classList.add(body_class);
            } else if (body_class !== null) {
                body_class.forEach(c => body_node.classList.add(c))
            }
            section_node.appendChild(head_node);

            if (collapsible) {
                const id = Math.random().toString(36).substring(2, 15);

                const header_collapse = {
                    "data-toggle": "collapse",
                    "data-target":"#collapsible-"+id,
                    "aria-expanded":(collapsed) ? "false": "true",
                    "aria-controls":"collapseExample"
                };

                for (const k in header_collapse) {
                    head_node.setAttribute(k, header_collapse[k]);
                }

                const collapse_node = document.createElement("div");
                collapse_node.classList.add("collapse");
                if (!collapsed) {
                    collapse_node.classList.add("show");
                }
                collapse_node.setAttribute("id", "collapsible-"+id);
                collapse_node.appendChild(body_node);
                section_node.appendChild(collapse_node);

            } else {
                section_node.appendChild(body_node);
            }

            // we can do any of the collapse behavior now if we want...
            parent.replaceChild(section_node, first_node);
            head_node.appendChild(first_node);
            for (let i = 1; i < nodes.length; i++) {
                const n = nodes[i];
                body_node.appendChild(n);
                // parent.removeChild(n);
            }

        }


        return make_groups;
    }

}
