/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { useState } from "react";

import axios from 'axios';

import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";

import { Card, ButtonGroup, Button, Table } from "react-bootstrap";

import { loginRequest, b2cPolicies, deployment } from "./authConfig";

export const Tenant = () => {
    const [nowShowing, setState] = useState("claims");    
    const { instance, accounts } = useMsal();
    return (
        <>
            <div>
                <ButtonGroup className="mb-2">
                    <Button onClick={() => setState("claims")}>Claims</Button>
                    <Button onClick={() => setState("members")}>Members</Button>
                    <Button onClick={() => setState("invitation")}>Invitation</Button>
                </ButtonGroup>                      
            </div>
            {nowShowing === "claims"?
                <IdTokenContent />
                :
                (nowShowing === "members")?
                    <Members instance = {instance} account = {accounts[0]}/>
                    :
                    <InviteMember />
            }            
        </>
    );
}

const IdTokenContent = () => {
    /**
     * useMsal is hook that returns the PublicClientApplication instance, 
     * an array of all accounts currently signed in and an inProgress value 
     * that tells you what msal is currently doing. For more, visit:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-react/docs/hooks.md
     */
    const { accounts } = useMsal();
    const [idTokenClaims, setIdTokenClaims] = useState(null);

    function GetIdTokenClaims() {
        console.log(idTokenClaims);
        setIdTokenClaims(accounts[0].idTokenClaims)
    }

    return (
        <>
            <h5 className="card-title">Welcome {accounts[0].name}</h5>
            {idTokenClaims ?
                <IdTokenClaims idTokenClaims={idTokenClaims} />
                :
                <Button variant="secondary" onClick={GetIdTokenClaims}>View ID Token Claims</Button>
            }
        </>
    );
};

const IdTokenClaims = (props) => {  
    return (
        <div id="token-div">
            <p><strong>Sign in name: </strong> {props.idTokenClaims.signInName}</p>               
            <p><strong>Email: </strong> {props.idTokenClaims.email}</p>            
            <p><strong>SUB: </strong> {props.idTokenClaims.sub}</p>
            <p><strong>UPN: </strong> {props.idTokenClaims.preferred_username}</p>
            <p><strong>App tenant: </strong> {props.idTokenClaims.appTenantName}</p>
            <p><strong>App tenant id: </strong> {props.idTokenClaims.appTenantId}</p>
            <p><strong>Roles: </strong> {props.idTokenClaims.roles}</p>
        </div>
    );
}

const InviteMember = () => {
    const [email, setEmail] = useState("abc@xyz.com");
    const [invitation, setInvitation] = useState(null);
    const { instance, accounts } = useMsal();    
    return (
        <div>
            <h5 className="card-title">Invitation</h5>
            <div>
                <div><p><i>Enter email address</i></p></div>                
                <div><input type="text" value={email} onChange={(e) => { setEmail(e.target.value); setInvitation(""); }}/></div>
                <div><Button onClick={() => 
                    {
                        console.log('starting click' + email);
                        setEmail(email);
                        setInvitation("");
                        instance.acquireTokenSilent({ 
                            authority:b2cPolicies.authorities.signIn.authority,
                            scopes: ["openid", "profile", `https://${deployment.b2cTenantName}.onmicrosoft.com/mtrest/User.Invite`, `https://${deployment.b2cTenantName}.onmicrosoft.com/mtrest/User.ReadAll`],
                            account: accounts[0]
                        }).then(function(accessTokenResponse) {
                            console.log("Email:"+email);
                            let accessToken = accessTokenResponse.accessToken;
                            axios.post(
                                `${deployment.restUrl}tenant/oauth2/invite`,
                                { inviteEmail: email, clientId: deployment.invitation.appId, replyUrl: deployment.invitation.replyUrl },
                                { headers: { 'Authorization': `Bearer ${accessToken}`} }
                              ).then(response => { setInvitation(response.data); console.log("invite received");})
                              .catch(error => console.log(error));
                        }).catch(function (error) {
                            if (error instanceof InteractionRequiredAuthError) {
                                instance.acquireTokenPopup(accessTokenRequest).then(function(accessTokenResponse) {
                                    let accessToken = accessTokenResponse.accessToken;
                                    callApi(accessToken);
                                }).catch(function(error) {
                                    console.log(error);
                                });
                            }
                            console.log(error);
                        });
                    }}>Invite</Button></div>
                {invitation?
                    <a href={invitation} target="_blank" rel="noopener">Invitation url</a>
                    :
                    <p/>
                }       
            </div>
         </div>
    );
};

class Members extends React.Component {
    constructor(props) {
        super(props);
        console.log(props);
        this.state = 
        {
            error : null,
            instance : props.instance,
            account : props.account,
            members : null,
            callApi : ((accessToken) =>
            {
                axios.get(
                    `${deployment.restUrl}tenant/oauth2/members`,
                    { headers: { 'Authorization': `Bearer ${accessToken}`} }
                )
                .then(response => { console.log(`${response.data.length} members received`); this.setState({ members: response.data }) })
                .catch(error => console.log(error));
            })
        }        
    }

    componentDidMount() {
        console.log('getMembers');
        let request = { 
            authority:b2cPolicies.authorities.signIn.authority,
            scopes: ["openid", "profile", `https://${deployment.b2cTenantName}.onmicrosoft.com/mtrest/User.Invite`, `https://${deployment.b2cTenantName}.onmicrosoft.com/mtrest/User.ReadAll`],
            account: this.state.account
        };
        let api = this.state.callApi;
        this.state.instance.acquireTokenSilent(request).then(function(accessTokenResponse) {
            let accessToken = accessTokenResponse.accessToken;
            api(accessToken)
        }).catch(function (error) {
            if (error instanceof InteractionRequiredAuthError) {
                this.state.instance.acquireTokenPopup(request).then(function(accessTokenResponse) {
                    let accessToken = accessTokenResponse.accessToken;
                    this.state.callApi(accessToken);
                }).catch(function(error) {
                    this.state.error = "Unable to acquire token: " + error;
                    console.log(error);
                });
            }
            console.log(error);
        });
    }

    render() {
        if(this.state.members) {
            console.log("Members has:" + this.state.members.length);
            const listMembers = this.state.members.map((m, ix) => {
                <tr>
                    <td>{ix}</td>
                    <td>{m.name}</td>
                    <td>{m.roles.toString()}</td>
                </tr>
                })
            return (
                <div>
                    <h5 className="card-title">{`Tenant: ${this.state.account.idTokenClaims.appTenantName} has ${this.state.members.length} members`}</h5>
                    <Table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Roles</th>
                            </tr>
                        </thead>    
                        <tbody>
                            { listMembers }   
                        </tbody>                                
                    </Table>
                </div>
            )
        } else if (this.state.error) return(<h2>this.state.error</h2>);
        else return null;
    };
};